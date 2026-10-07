"""Colab/CLI: grouped validation, Optuna XGBoost tuning, SHAP and checked ONNX export.

Real labels must be independent job-skill assessments observed after immutable
feature snapshots. No personality, burnout, turnover or synthetic proxy labels.
"""
from __future__ import annotations
from datetime import datetime,timezone
from pathlib import Path
import argparse,hashlib,json
import numpy as np
from .feature_engineering import FEATURES,LABELS,CONTRACT_VERSION,number,timestamp
from .data_loader import SupabaseLoader


def reference_background():
    # Product-defined reference grid, never exports employee records as explainers' background.
    rng=np.random.default_rng(19)
    return np.column_stack([rng.uniform(30,80,16),rng.uniform(40,85,16),rng.uniform(25,85,16),
                            rng.uniform(0,12,16),rng.integers(0,8,16),rng.uniform(-2,6,16)]).astype(np.float32)


def training_arrays(examples):
    X=[];y=[];groups=[]
    limits=((0,100),(0,100),(0,100),(0,60),(0,1000),(-100,100))
    for row in examples:
        if row.get('contract_version')!=CONTRACT_VERSION:raise ValueError('Snapshot feature contract mismatch')
        if timestamp(row['label_observed_at'])<=timestamp(row['feature_as_of']):raise ValueError('Label must be observed strictly after the feature snapshot')
        if timestamp(row['label_observed_at'])>datetime.now(timezone.utc):raise ValueError('Label cannot be in the future')
        if row.get('label_source')!='independent_assessment':raise ValueError('Only independent assessment labels are accepted')
        snapshot=row['feature_snapshot']
        X.append([number(snapshot[f],*bounds,name=f) for f,bounds in zip(FEATURES,limits)])
        y.append(number(row['readiness_label']));groups.append(row['user_id'])
    if len(X)<100 or len(set(groups))<30:raise ValueError('Need >=100 consented snapshots from >=30 people; do not silently synthesize labels')
    return np.asarray(X,dtype=np.float32),np.asarray(y,dtype=np.float32),np.asarray(groups)


def train(examples,out_dir,*,data_source='supabase',trials=20,seed=42,half_life_months=12):
    if data_source not in ('supabase','synthetic'):raise ValueError('Unknown model data source')
    if not 1<=trials<=200:raise ValueError('trials must be 1..200')
    if half_life_months!=12:raise ValueError('Changing the half-life requires a new snapshot contract and matching dataset')
    import optuna,xgboost as xgb,shap
    from sklearn.model_selection import GroupShuffleSplit,GroupKFold
    from sklearn.metrics import mean_absolute_error,mean_squared_error,r2_score
    from onnxmltools import convert_xgboost
    from onnxmltools.convert.common.data_types import FloatTensorType
    import onnxruntime as ort
    X,y,groups=training_arrays(examples)
    train_idx,test_idx=next(GroupShuffleSplit(n_splits=1,test_size=.2,random_state=seed).split(X,y,groups))
    # Every row from an employee stays in one fold. Holdout never enters Optuna.
    folds=list(GroupKFold(3).split(X[train_idx],y[train_idx],groups[train_idx]))
    def make(params):return xgb.XGBRegressor(objective='reg:squarederror',tree_method='hist',random_state=seed,n_jobs=2,**params)
    def objective(trial):
        p={'n_estimators':trial.suggest_int('n_estimators',60,240,step=60),
           'max_depth':trial.suggest_int('max_depth',2,5),'learning_rate':trial.suggest_float('learning_rate',.02,.15,log=True),
           'min_child_weight':trial.suggest_float('min_child_weight',1,15),
           'subsample':trial.suggest_float('subsample',.7,1),'colsample_bytree':trial.suggest_float('colsample_bytree',.7,1),
           'reg_lambda':trial.suggest_float('reg_lambda',.1,15,log=True),'reg_alpha':trial.suggest_float('reg_alpha',.001,2,log=True)}
        errors=[]
        for a,b in folds:
            model=make(p).fit(X[train_idx][a],y[train_idx][a])
            errors.append(mean_squared_error(y[train_idx][b],model.predict(X[train_idx][b])))
        return float(np.mean(errors))
    study=optuna.create_study(direction='minimize',sampler=optuna.samplers.TPESampler(seed=seed))
    study.optimize(objective,n_trials=trials,timeout=1800)
    model=make(study.best_params).fit(X[train_idx],y[train_idx])
    predicted=model.predict(X[test_idx]);baseline=np.full(len(test_idx),y[train_idx].mean())
    metrics={'holdout_mae':float(mean_absolute_error(y[test_idx],predicted)),
             'holdout_rmse':float(np.sqrt(mean_squared_error(y[test_idx],predicted))),
             'holdout_r2':float(r2_score(y[test_idx],predicted)),
             'baseline_mae':float(mean_absolute_error(y[test_idx],baseline)),
             'train_rows':len(train_idx),'test_rows':len(test_idx),'group_overlap':len(set(groups[train_idx])&set(groups[test_idx])),
             'cv_mse':study.best_value,'trials':len(study.trials)}
    if not all(np.isfinite(v) for v in metrics.values()):raise RuntimeError('Nonfinite evaluation metric')
    root=Path(out_dir);root.mkdir(parents=True,exist_ok=True)
    background=reference_background()
    explainer=shap.TreeExplainer(model,data=background,feature_perturbation='interventional',model_output='raw')
    probe=X[test_idx][:min(100,len(test_idx))]
    values=explainer.shap_values(probe,check_additivity=True)
    np.testing.assert_allclose(explainer.expected_value+values.sum(axis=1),model.predict(probe),atol=.001)
    importance={f:float(v) for f,v in zip(FEATURES,np.abs(values).mean(axis=0))}
    from .pipeline_runner import explanation
    reference=background[0]
    reference_phi=explainer.shap_values(reference[None,:],check_additivity=True)[0]
    readable=explanation(reference_phi,float(explainer.expected_value),float(model.predict(reference[None,:])[0]),dict(zip(FEATURES,reference)))
    readable['method']='tree_shap_interventional'
    readable['example']='Product-defined reference row; not an employee record'
    (root/'training_explanation.json').write_text(json.dumps(readable,indent=2,allow_nan=False))
    # Fail closed on conversion failure. There is no silent pickle fallback.
    onx=convert_xgboost(model,initial_types=[('input',FloatTensorType([None,len(FEATURES)]))],target_opset=15)
    raw=onx.SerializeToString();(root/'readiness.onnx').write_bytes(raw)
    session=ort.InferenceSession(raw,providers=['CPUExecutionProvider'])
    parity=np.vstack([probe,background,np.zeros((1,len(FEATURES)),dtype=np.float32),np.full((1,len(FEATURES)),np.nan,dtype=np.float32)])
    expected=model.predict(parity);actual=session.run(None,{'input':parity})[0].reshape(-1)
    np.testing.assert_allclose(actual,expected,rtol=1e-5,atol=1e-3)
    metrics['onnx_max_abs_error']=float(np.max(np.abs(actual-expected)))
    model.save_model(root/'readiness.xgb.json')
    (root/'background.json').write_text(json.dumps(background.tolist(),allow_nan=False))
    version=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+hashlib.sha256(raw).hexdigest()[:10]
    manifest={'model_name':'skill_passport_readiness_v2','model_version':version,'contract_version':CONTRACT_VERSION,
              'data_source':data_source,'features':list(FEATURES),'labels':LABELS,'half_life_months':half_life_months,
              'onnx_sha256':hashlib.sha256(raw).hexdigest(),
              'background_sha256':hashlib.sha256((root/'background.json').read_bytes()).hexdigest(),
              'metrics':metrics,'parameters':study.best_params,'feature_importance':importance,
              'eligible_for_review':data_source=='supabase' and metrics['holdout_mae']<metrics['baseline_mae'],
              'limitations':['Job-skill estimate, not a hiring decision.','Synthetic metrics only verify the software pipeline.' if data_source=='synthetic' else 'Requires out-of-time and subgroup validation before employment use.',
                              'No inferred mental health, personality or turnover outputs.','Decay half-life is a configurable assumption.']}
    (root/'manifest.json').write_text(json.dumps(manifest,indent=2,allow_nan=False))
    (root/'model_card.md').write_text('# Skill Passport readiness model\n\n'+json.dumps(manifest,indent=2)+'\n\nHoldout employees were excluded from all tuning and training. No final refit on holdout data. SHAP measures model associations, not causes.\n')
    return manifest


def upload_bundle(root,loader):
    root=Path(root);manifest=json.loads((root/'manifest.json').read_text())
    if manifest['data_source']!='supabase':raise ValueError('Synthetic bundles cannot be uploaded to production')
    files={}
    for name in ['readiness.onnx','background.json','manifest.json','model_card.md','readiness.xgb.json']:
        raw=(root/name).read_bytes();path=f"{manifest['model_version']}/{name}"
        loader.client.storage.from_('models').upload(path,raw,{'content-type':'application/octet-stream','upsert':'false'})
        files[name]={'path':path,'sha256':hashlib.sha256(raw).hexdigest()}
    loader.client.table('model_registry').upsert({'model_name':manifest['model_name'],'version':manifest['model_version'],
        'data_source':'supabase','is_active':False,'n_train':manifest['metrics']['train_rows'],
        'features':manifest['features'],'feature_spec':{'contract_version':CONTRACT_VERSION},'metrics':manifest['metrics'],
        'hyperparameters':manifest['parameters'],'feature_importance':manifest['feature_importance'],'artifacts':files,
        'notes':'Inactive until reviewed and explicitly activated; read model_card.md.'},on_conflict='model_name,version').execute()


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--demo',action='store_true');p.add_argument('--trials',type=int,default=20)
    p.add_argument('--output',default='ml/artifacts');p.add_argument('--upload',action='store_true');args=p.parse_args()
    if not 1<=args.trials<=200:p.error('trials must be 1..200')
    if args.demo:
        if args.upload:p.error('Synthetic upload is forbidden')
        from .demo_data import training_examples
        examples=training_examples();loader=None
    else:loader=SupabaseLoader();examples=loader.training_examples()
    manifest=train(examples,args.output,data_source='synthetic' if args.demo else 'supabase',trials=args.trials)
    if args.upload:upload_bundle(args.output,loader)
    print(json.dumps({'model_version':manifest['model_version'],'source':manifest['data_source'],'metrics':manifest['metrics']}))

if __name__=='__main__':main()

"""CPU ONNX serving and exact finite-background interventional Shapley values.

Training-only xgboost, optuna, pandas and shap are deliberately not imported.
"""
from __future__ import annotations
from datetime import datetime,timezone
from pathlib import Path
import argparse,hashlib,itertools,json,math,os
import numpy as np
from .feature_engineering import FEATURES,LABELS,CONTRACT_VERSION,engineer_user
from .data_loader import SupabaseLoader,DataBundle


def canonical_hash(features:dict)->str:
    values=[float(features[f]) for f in FEATURES]
    if not all(math.isfinite(v) for v in values):raise ValueError('Features must be finite')
    return hashlib.sha256(json.dumps(values,separators=(',',':')).encode()).hexdigest()


def explain_onnx(predict,x:np.ndarray,background:np.ndarray)->tuple[np.ndarray,float]:
    """Exact Shapley enumeration for the fixed six-feature contract (64 coalitions).

    This is SHAP for empirical interventional expectations, not TreeSHAP reuse
    or global feature importance. The same model and row generate score and drivers.
    Background is a small non-personal, product-defined reference grid.
    """
    x=np.asarray(x,dtype=np.float32);background=np.asarray(background,dtype=np.float32)
    m=len(x)
    if m!=len(FEATURES) or background.ndim!=2 or background.shape[1]!=m or not 1<=len(background)<=32:
        raise ValueError('Invalid explanation input contract')
    masks=np.array([[(bits>>j)&1 for j in range(m)] for bits in range(1<<m)],dtype=bool)
    coalitions=np.where(masks[:,None,:],x[None,None,:],background[None,:,:]).reshape(-1,m)
    values=predict(coalitions).reshape(1<<m,len(background)).mean(axis=1)
    phi=np.zeros(m,dtype=np.float64)
    for j in range(m):
        for bits in range(1<<m):
            if bits&(1<<j):continue
            k=bits.bit_count();weight=1/(m*math.comb(m-1,k))
            phi[j]+=weight*(values[bits|(1<<j)]-values[bits])
    if not np.isclose(values[0]+phi.sum(),values[-1],atol=1e-3):raise RuntimeError('SHAP additivity failed')
    return phi,float(values[0])


def explanation(phi,baseline,raw_prediction,features):
    drivers=sorted([{'feature':f,'label':LABELS[f],'value':float(features[f]),'contribution':round(float(v),5)} for f,v in zip(FEATURES,phi)],key=lambda d:abs(d['contribution']),reverse=True)
    positive=[d for d in drivers if d['contribution']>0.001];negative=[d for d in drivers if d['contribution']<-.001]
    phrases=[]
    if positive:phrases.append(f"Biggest boost: {positive[0]['label']} (+{positive[0]['contribution']:.1f} points).")
    if negative:phrases.append(f"Largest gap: {negative[0]['label']} ({negative[0]['contribution']:.1f} points).")
    return {'method':'exact_interventional_shap','reference':'product_reference_grid_v1',
            'baseline':baseline,'raw_prediction':float(raw_prediction),'drivers':drivers,
            'summary':' '.join(phrases) or 'This profile is close to the reference score.',
            'note':'Model associations, not causes. Contributions sum to the raw model score before clipping.'}


class Scorer:
    def __init__(self,bundle_dir:str|Path,*,allow_demo=False):
        import onnxruntime as ort
        root=Path(bundle_dir)
        self.manifest=json.loads((root/'manifest.json').read_text())
        if self.manifest['contract_version']!=CONTRACT_VERSION or self.manifest['features']!=list(FEATURES):raise ValueError('Feature contract mismatch')
        if self.manifest['data_source']=='synthetic' and not allow_demo:raise ValueError('Synthetic models are demo-only')
        raw=(root/'readiness.onnx').read_bytes()
        if hashlib.sha256(raw).hexdigest()!=self.manifest['onnx_sha256']:raise ValueError('Model checksum mismatch')
        background_path=root/'background.json'
        if hashlib.sha256(background_path.read_bytes()).hexdigest()!=self.manifest['background_sha256']:raise ValueError('Background checksum mismatch')
        self.background=np.asarray(json.loads(background_path.read_text()),dtype=np.float32)
        options=ort.SessionOptions();options.intra_op_num_threads=1;options.inter_op_num_threads=1
        self.session=ort.InferenceSession(raw,sess_options=options,providers=['CPUExecutionProvider'])
        self.input=self.session.get_inputs()[0].name

    def predict(self,X):return np.asarray(self.session.run(None,{self.input:np.asarray(X,dtype=np.float32)})[0]).reshape(-1)

    def score(self,engineered:dict):
        features=engineered['features'];x=np.array([features[f] for f in FEATURES],dtype=np.float32)
        raw=float(self.predict(x[None,:])[0]);phi,base=explain_onnx(self.predict,x,self.background)
        score=float(np.clip(raw,0,100));now=datetime.now(timezone.utc).isoformat()
        row={'user_id':engineered['user_id'],'role_readiness_pred':round(score,4),
             'readiness_band':'Strong coverage' if score>=75 else 'Developing coverage' if score>=50 else 'Building foundations',
             'technical_index':round(features['technical_index'],4),'communication_score':round(features['communication_score'],4),
             'task_fit_score':round(features['task_fit_score'],4),'weighted_readiness_score':engineered['weighted_readiness_score'],
             'leadership_readiness_score':engineered['leadership_readiness_score'],'mentorship':engineered['mentorship'],
             'skill_decay':engineered['skill_decay'],'skill_gaps':engineered['skill_gaps'],
             'explanation':explanation(phi,base,raw,features),'input_hash':canonical_hash(features),
             'feature_as_of':engineered['feature_as_of'],'model_version':self.manifest['model_version'],
             'is_synthetic':self.manifest['data_source']=='synthetic','scored_at':now,
             'data_quality':{'evidence_count':engineered['evidence_count'],'growth_observed':engineered['growth_observed'],
                             'evidence_note':'Self-reported unless individually assessed; historical inactivity is a configurable assumption.'}}
        return row,{'user_id':row['user_id'],**engineered['workload'],'scored_at':now}


def run(bundle:DataBundle,scorer:Scorer,loader:SupabaseLoader|None=None,*,write=False):
    if write and (loader is None or scorer.manifest['data_source']!='supabase'):raise ValueError('Write-back requires a real model and Supabase loader')
    report={'scored':[],'skipped':[]}
    for p in bundle.profiles:
        try:
            engineered=engineer_user(p,bundle.skill_logs,bundle.tasks,bundle.assignments,bundle.as_of,scorer.manifest['half_life_months'])
        except ValueError as exc:
            report['skipped'].append({'user_id':p['user_id'],'reason':str(exc)});continue
        row,workload=scorer.score(engineered)
        if write:loader.publish(row,workload)
        report['scored'].append(row if not write else {'user_id':p['user_id'],'model_version':row['model_version']})
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle',required=True);parser.add_argument('--user-id');parser.add_argument('--write',action='store_true')
    parser.add_argument('--demo',action='store_true');parser.add_argument('--output',default='predictions.json')
    args=parser.parse_args()
    if args.demo:
        if args.write:parser.error('Demo write-back is forbidden')
        from .demo_data import demo_bundle
        data=demo_bundle();loader=None
    else:loader=SupabaseLoader();data=loader.load(args.user_id)
    report=run(data,Scorer(args.bundle,allow_demo=args.demo),loader,write=args.write)
    Path(args.output).write_text(json.dumps(report,indent=2,allow_nan=False))
    print(json.dumps({'scored':len(report['scored']),'skipped':len(report['skipped']),'write':args.write}))

if __name__=='__main__':main()

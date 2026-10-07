"""Run with: python -m pytest ml/tests -q. Entire suite stays local."""
from copy import deepcopy
from datetime import datetime,timezone,timedelta
from pathlib import Path
import numpy as np
import pytest
from ml.feature_engineering import skill_half_life,cognitive_load_ratio,mentorship_multiplier,overall_readiness,engineer_user,FEATURES
from ml.demo_data import demo_bundle,training_examples
from ml.pipeline_runner import explain_onnx,Scorer,run
from ml.train_and_explain import training_arrays,train,upload_bundle


def test_decay_halves_and_is_monotonic():
    assert skill_half_life(80,12,12)==pytest.approx(40)
    assert skill_half_life(80,0)==80
    assert skill_half_life(80,24)<skill_half_life(80,12)

@pytest.mark.parametrize('args',[(80,-1,12),(80,3,0),(float('nan'),0,12),(80,float('inf'),12)])
def test_decay_rejects_invalid_numbers(args):
    with pytest.raises(ValueError):skill_half_life(*args)


def test_workload_boundary_missing_and_zero():
    assert not cognitive_load_ratio(3,2.5)['workload_review_flag']
    assert cognitive_load_ratio(4,3)['workload_review_flag']
    assert cognitive_load_ratio(None,None)['ratio'] is None
    with pytest.raises(ValueError):cognitive_load_ratio(4,0)


def test_mentoring_is_shrunk_capped_and_neutral_without_evidence():
    assert mentorship_multiplier([])['multiplier']==1
    assert mentorship_multiplier([-5])['multiplier']==1
    assert mentorship_multiplier([10])['multiplier']<mentorship_multiplier([10]*20)['multiplier']<1.25
    assert mentorship_multiplier([10]*4,1)['multiplier']<mentorship_multiplier([10]*4,4)['multiplier']


def test_weighted_score_is_explicit():
    assert overall_readiness(80,60,40)==65
    with pytest.raises(ValueError):overall_readiness(80,60,40,(1,1,1))


def test_no_future_evidence_or_post_snapshot_backfill_leaks():
    b=demo_bundle();profile=b.profiles[0]
    expected=engineer_user(profile,b.skill_logs,b.tasks,b.assignments,b.as_of)
    injected=deepcopy(b.skill_logs[0]);injected.update(id='future',score=0,practiced_at=(b.as_of+timedelta(days=1)).isoformat())
    late=deepcopy(b.skill_logs[0]);late.update(id='backfill',score=0,practiced_at=b.as_of.isoformat(),recorded_at=(b.as_of+timedelta(days=1)).isoformat())
    actual=engineer_user(profile,b.skill_logs+[injected,late],b.tasks,b.assignments,b.as_of)
    assert expected==actual
    missing=[x for x in b.skill_logs if x['kind']!='communication']
    with pytest.raises(ValueError,match='communication'):engineer_user(profile,missing,b.tasks,[],b.as_of)


def test_workload_stales_after_30_days():
    b=demo_bundle();b.tasks[0]['observed_at']=(b.as_of-timedelta(days=31)).isoformat()
    result=engineer_user(b.profiles[0],b.skill_logs,b.tasks,[],b.as_of)
    assert result['workload']['ratio'] is None
    assert set(result['features'])==set(FEATURES)
    assert not any(k in result['features'] for k in ('burnout','personality','workload','flight_risk'))


def test_shap_linear_model_known_answer():
    x=np.array([60,70,50,3,4,2],dtype=np.float32);background=np.zeros((4,6),dtype=np.float32)
    weights=np.array([.5,.25,.25,.1,.2,.3],dtype=np.float32)
    phi,base=explain_onnx(lambda a:a@weights+7,x,background)
    np.testing.assert_allclose(phi,x*weights,atol=1e-5)
    assert base==pytest.approx(7)
    assert base+sum(phi)==pytest.approx(float(x@weights+7),abs=1e-5)


def test_training_rejects_leaking_labels_and_too_little_data():
    rows=training_examples()
    with pytest.raises(ValueError,match='100'):training_arrays(rows[:10])
    rows[0]['label_observed_at']=rows[0]['feature_as_of']
    with pytest.raises(ValueError,match='strictly after'):training_arrays(rows)


@pytest.fixture(scope='module')
def trained(tmp_path_factory):
    root=tmp_path_factory.mktemp('model')
    manifest=train(training_examples(),root,data_source='synthetic',trials=2)
    return root,manifest


def test_export_score_and_shap_integration(trained):
    root,m=trained
    assert m['metrics']['group_overlap']==0
    assert m['metrics']['onnx_max_abs_error']<.001
    scorer=Scorer(root,allow_demo=True);report=run(demo_bundle(),scorer)
    assert len(report['scored'])==1 and not report['skipped']
    row=report['scored'][0];ex=row['explanation']
    assert row['is_synthetic'] and 0<=row['role_readiness_pred']<=100
    assert ex['baseline']+sum(d['contribution'] for d in ex['drivers'])==pytest.approx(ex['raw_prediction'],abs=.001)
    with pytest.raises(ValueError,match='demo-only'):Scorer(root)
    with pytest.raises(ValueError,match='real model'):run(demo_bundle(),scorer,write=True)
    with pytest.raises(ValueError,match='cannot be uploaded'):upload_bundle(root,None)


def test_tampered_model_rejected(trained,tmp_path):
    import shutil
    root,_=trained
    for name in ('manifest.json','background.json','readiness.onnx'):shutil.copy(root/name,tmp_path/name)
    with (tmp_path/'readiness.onnx').open('ab') as f:f.write(b'tampered')
    with pytest.raises(ValueError,match='checksum'):Scorer(tmp_path,allow_demo=True)

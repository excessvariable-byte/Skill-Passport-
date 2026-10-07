"""Explicit synthetic fixtures. Never written to auth.users or production analytics."""
from datetime import datetime,timezone,timedelta
from uuid import UUID
import numpy as np
from .feature_engineering import FEATURES,CONTRACT_VERSION
from .data_loader import DataBundle


def training_examples(n=400):
    rng=np.random.default_rng(42);rows=[]
    for i in range(n):
        x=[rng.uniform(10,95),rng.uniform(20,95),rng.uniform(5,95),rng.uniform(0,15),float(rng.integers(0,10)),rng.uniform(-3,8)]
        y=float(np.clip(.5*x[0]+.25*x[1]+.25*x[2]+rng.normal(0,4),0,100))
        rows.append({'user_id':str(UUID(int=i//2+1)),'feature_snapshot':dict(zip(FEATURES,x)),
                     'feature_as_of':'2025-01-01T00:00:00Z','label_observed_at':'2025-02-01T00:00:00Z',
                     'label_source':'independent_assessment','readiness_label':y,'contract_version':CONTRACT_VERSION})
    return rows


def demo_bundle():
    now=datetime(2026,10,7,tzinfo=timezone.utc);uid=str(UUID(int=1));logs=[]
    for i,(skill,score,kind) in enumerate([('Python',86,'technical'),('SQL',78,'technical'),('Data visualization',71,'technical'),('Collaboration',82,'communication')]):
        date=(now-timedelta(days=30*(i+1))).isoformat()
        logs.append({'id':str(i),'user_id':uid,'skill':skill,'score':score,'kind':kind,'source':'self_reported','practiced_at':date,'recorded_at':date})
    return DataBundle([{'user_id':uid,'target_role':'Data Analyst','experience_years':3}],logs,
                      [{'user_id':uid,'complexity':4,'baseline_capacity':3,'observed_at':now.isoformat()}],[],now)

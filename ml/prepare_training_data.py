"""Capture consented point-in-time features now; attach independent assessments later.

Snapshots contain private employee identifiers. Keep them outside public source
control and delete them according to your retention policy. Never invent labels.
"""
from __future__ import annotations
from datetime import datetime,timezone
from pathlib import Path
import argparse,csv,json
from .data_loader import SupabaseLoader
from .feature_engineering import engineer_user,CONTRACT_VERSION,number,timestamp
from .pipeline_runner import canonical_hash


def capture(loader,output):
    bundle=loader.load();snapshots=[];skipped=[]
    for profile in bundle.profiles:
        if not profile.get('training_consent'):continue
        try:row=engineer_user(profile,bundle.skill_logs,bundle.tasks,bundle.assignments,bundle.as_of)
        except ValueError as exc:skipped.append({'user_id':profile['user_id'],'reason':str(exc)});continue
        snapshots.append({'user_id':profile['user_id'],'feature_as_of':row['feature_as_of'],
                          'contract_version':CONTRACT_VERSION,'feature_snapshot':row['features'],
                          'input_hash':canonical_hash(row['features']),'half_life_months':12})
    Path(output).write_text(json.dumps(snapshots,indent=2,allow_nan=False))
    return {'captured':len(snapshots),'skipped':skipped}


def attach(loader,snapshots_path,labels_path,*,write=False):
    snapshots=json.loads(Path(snapshots_path).read_text())
    lookup={(s['user_id'],s['feature_as_of']):s for s in snapshots}
    consenting={p['user_id'] for p in loader.rows('skill_passports',filters={'training_consent':True},order='user_id')}
    rows=[];now=datetime.now(timezone.utc)
    with open(labels_path,newline='') as f:
        for label in csv.DictReader(f):
            s=lookup[(label['user_id'],label['feature_as_of'])]
            if s['user_id'] not in consenting:continue
            if canonical_hash(s['feature_snapshot'])!=s['input_hash']:raise ValueError('Snapshot checksum changed')
            if s['contract_version']!=CONTRACT_VERSION or s['half_life_months']!=12:raise ValueError('Snapshot contract mismatch')
            observed=timestamp(label['label_observed_at'])
            if not timestamp(s['feature_as_of'])<observed<=now:raise ValueError('Assessment must follow the snapshot and cannot be future dated')
            rows.append({k:s[k] for k in ('user_id','feature_as_of','contract_version','feature_snapshot')}|{
                'readiness_label':number(label['readiness_label']),'label_observed_at':observed.isoformat(),'label_source':'independent_assessment'})
    if write:
        for start in range(0,len(rows),200):loader.client.table('training_examples').upsert(rows[start:start+200],on_conflict='user_id,feature_as_of,label_observed_at',ignore_duplicates=True).execute()
    return {'eligible_examples':len(rows),'written':write}


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
    capture_cmd=sub.add_parser('capture');capture_cmd.add_argument('--output',default='private_snapshots.json')
    attach_cmd=sub.add_parser('attach');attach_cmd.add_argument('--snapshots',required=True);attach_cmd.add_argument('--labels',required=True);attach_cmd.add_argument('--write',action='store_true')
    args=p.parse_args();loader=SupabaseLoader()
    print(json.dumps(capture(loader,args.output) if args.command=='capture' else attach(loader,args.snapshots,args.labels,write=args.write)))

if __name__=='__main__':main()

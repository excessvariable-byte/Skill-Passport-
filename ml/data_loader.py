"""Paginated Supabase access. Privileged credentials live only in Colab/server secrets.

No fallback to fabricated data when a table is missing or a network request fails.
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
import os,time
import httpx
from uuid import UUID
from typing import Any,Callable

@dataclass
class DataBundle:
    profiles:list[dict]
    skill_logs:list[dict]
    tasks:list[dict]
    assignments:list[dict]
    as_of:datetime


def secret(name:str):
    value=os.getenv(name)
    if value:return value
    try:
        from google.colab import userdata
        return userdata.get(name)
    except (ImportError,KeyError):return None
    except Exception:return None


def retry(fn:Callable,attempts=3):
    """Bounded retry only for transport/5xx/429, never hide auth/schema failures."""
    for attempt in range(attempts):
        try:return fn()
        except Exception as exc:
            status=getattr(exc,"status_code",None)
            code=str(getattr(exc,"code",""))
            transient=status in (429,500,502,503,504) or code in ('500','502','503','504') or isinstance(exc,(TimeoutError,ConnectionError,httpx.TimeoutException,httpx.NetworkError))
            if not transient or attempt+1==attempts:raise
            time.sleep(min(4,2**attempt))


class SupabaseLoader:
    def __init__(self,client:Any=None):
        if client is not None:self.client=client;return
        from supabase import create_client,ClientOptions
        url=secret('SUPABASE_URL') or secret('NEXT_PUBLIC_SUPABASE_URL')
        key=secret('SUPABASE_SERVICE_KEY') or secret('SUPABASE_SERVICE_ROLE_KEY')
        if not url or not key:raise RuntimeError('Configure SUPABASE_URL and SUPABASE_SERVICE_KEY in server or Colab secrets')
        self.client=create_client(url,key,options=ClientOptions(auto_refresh_token=False,persist_session=False,postgrest_client_timeout=20))

    def rows(self,table:str,*,filters:dict|None=None,order='id',limit=100000,columns='*'):
        result=[];page_size=500
        for offset in range(0,limit,page_size):
            query=self.client.table(table).select(columns)
            for key,value in (filters or {}).items():query=query.eq(key,value)
            for column in (order if isinstance(order,(list,tuple)) else [order]):query=query.order(column)
            response=retry(lambda:query.range(offset,min(offset+page_size,limit)-1).execute())
            rows=response.data or [];result.extend(rows)
            if len(rows)<page_size:return result
        raise RuntimeError(f'{table}: row limit exceeded; partition the job instead of silently truncating')

    def load(self,user_id:str|None=None,as_of:datetime|None=None)->DataBundle:
        if user_id:UUID(user_id)
        as_of=as_of or datetime.now(timezone.utc)
        profiles=self.rows('skill_passports',filters={'user_id':user_id} if user_id else None,order='user_id')
        assignments=self.rows('peer_assignments',filters={'senior_id':user_id} if user_id else None)
        if user_id:
            known={a['id'] for a in assignments}
            for junior in sorted({a['junior_id'] for a in assignments}):
                for a in self.rows('peer_assignments',filters={'junior_id':junior}):
                    if a['id'] not in known:assignments.append(a);known.add(a['id'])
        shares={(r['user_id'],r['company_id']) for r in self.rows('passport_shares',order=('user_id','company_id'))}
        assignments=[a for a in assignments if (a['senior_id'],a['company_id']) in shares and (a['junior_id'],a['company_id']) in shares]
        # A user's mentorship computation also needs the participating juniors' skill histories.
        if user_id:
            ids={user_id}|{a['junior_id'] for a in assignments}
            logs=[]
            for uid in sorted(ids):logs.extend(self.rows('skill_logs',filters={'user_id':uid}))
            tasks=self.rows('project_tasks',filters={'user_id':user_id})
        else:
            logs=self.rows('skill_logs');tasks=self.rows('project_tasks')
        return DataBundle(profiles,logs,tasks,assignments,as_of)

    def training_examples(self):
        consenting={p['user_id'] for p in self.rows('skill_passports',filters={'training_consent':True},order='user_id')}
        return [r for r in self.rows('training_examples') if r['user_id'] in consenting]

    def publish(self,analytics:dict,workload:dict):
        """One transaction; database rejects stale snapshots and inactive/demo models."""
        return retry(lambda:self.client.rpc('store_skill_analytics',{'p_analytics':analytics,'p_workload':workload}).execute())

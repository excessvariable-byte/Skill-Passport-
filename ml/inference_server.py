"""Authenticated, bounded Vercel Python inference endpoint. POST /api/inference."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
import hashlib,json,os,tempfile,threading
from uuid import UUID

MAX_ARTIFACT_BYTES=16*1024*1024
_CACHE={}
_CACHE_LOCK=threading.Lock()


def active_scorer(loader):
    with _CACHE_LOCK:
        return _active_scorer(loader)

def _active_scorer(loader):
    from ml.pipeline_runner import Scorer
    rows=loader.client.table('model_registry').select('*').eq('model_name','skill_passport_readiness_v2').eq('is_active',True).eq('data_source','supabase').execute().data
    if len(rows)!=1:raise LookupError('A reviewed production model has not been activated yet.')
    row=rows[0];version=row['version']
    if version in _CACHE:return _CACHE[version]
    root=Path(tempfile.gettempdir())/'skill-passport-models'/hashlib.sha256(version.encode()).hexdigest();root.mkdir(parents=True,exist_ok=True)
    for name in ['manifest.json','background.json','readiness.onnx']:
        spec=row['artifacts'][name]
        raw=loader.client.storage.from('models').download(spec['path'])
        if len(raw)>MAX_ARTIFACT_BYTES or hashlib.sha256(raw).hexdigest()!=spec['sha256']:raise ValueError('Artifact integrity check failed')
        temp=root/(name+'.tmp');temp.write_bytes(raw);temp.replace(root/name)
    scorer=Scorer(root)
    if scorer.manifest['model_version']!=version:raise ValueError('Registry version mismatch')
    _CACHE.clear();_CACHE[version]=scorer
    return scorer


class handler(BaseHTTPRequestHandler):
    def reply(self,status,payload):
        body=json.dumps(payload,allow_nan=False).encode();self.send_response(status)
        self.send_header('Content-Type','application/json');self.send_header('Cache-Control','private, no-store')
        self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)

    def do_POST(self):
        auth=self.headers.get('Authorization','')
        if not auth.startswith('Bearer '):return self.reply(401,{'error':'Sign in to refresh your analytics.'})
        try: length=int(self.headers.get('Content-Length','0') or 0)
        except ValueError:return self.reply(400,{'error':'Invalid request size.'})
        if length<0 or length>1024:return self.reply(413,{'error':'Request too large.'})
        try:
            from ml.data_loader import SupabaseLoader
            from ml.pipeline_runner import run
            loader=SupabaseLoader()
        except Exception:return self.reply(503,{'error':'The inference worker needs its Supabase server secret. See the setup guide.'})
        try:
            user=loader.client.auth.get_user(auth[7:]).user
            if not user:raise ValueError('Missing user')
            user_id=str(UUID(user.id))
        except Exception:return self.reply(401,{'error':'Your session expired. Sign in again.'})
        try:
            scorer=active_scorer(loader)
            claimed=loader.client.rpc('claim_inference_request',{'p_user_id':user_id}).execute().data
            if not claimed:return self.reply(429,{'error':'Analytics were requested recently. Please wait one minute.'})
            report=run(loader.load(user_id),scorer,loader,write=True)
            if report['skipped']:return self.reply(422,{'error':report['skipped'][0]['reason']})
            if not report['scored']:return self.reply(404,{'error':'Create your employee profile first.'})
            self.reply(200,{'scored':True,'model_version':scorer.manifest['model_version']})
        except LookupError as exc:self.reply(503,{'error':str(exc)})
        except Exception as exc:
            # No tokens, rows, passwords, provider responses or private evidence in logs.
            print('inference_failure',type(exc).__name__)
            self.reply(503,{'error':'Scoring could not finish. If you just changed evidence, retry in a minute.'})

    def do_GET(self):self.reply(405,{'error':'Use POST with your authenticated session.'})

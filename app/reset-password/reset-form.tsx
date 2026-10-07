'use client';
import {useState,type FormEvent} from 'react';
import {createClient} from '@/lib/supabase/client';
import {authMessage} from '@/lib/email-auth';
export default function ResetPasswordForm(){
 const [password,setPassword]=useState('');const [confirmation,setConfirmation]=useState('');
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);
 async function submit(event:FormEvent){
  event.preventDefault();setError('');
  if(password!==confirmation){setError('The passwords do not match.');return;}
  setBusy(true);
  try{const {error}=await createClient().auth.updateUser({password});if(error)throw error;setPassword('');setConfirmation('');setDone(true);}
  catch(error){setError(authMessage(error));}finally{setBusy(false);}
 }
 return done?<><p role="status">Your password has been updated.</p><a className="button primary" href="/">Open workspace</a></>:<form onSubmit={submit} className="auth-form"><label htmlFor="new-password">New password (at least 8 characters)</label><input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy} value={password} onChange={e=>setPassword(e.target.value)}/><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/>{error&&<p className="form-error" role="alert">{error}</p>}<button className="button primary full" disabled={busy}>{busy?'Saving…':'Save new password'}</button><a href="/login">Back to sign in</a></form>;
}

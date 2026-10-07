'use client';
import {useState, type FormEvent} from 'react';
import {createClient} from '@/lib/supabase/client';
import {authMessage, emailCallback} from '@/lib/email-auth';
type Mode='signin'|'signup'|'reset';
export default function LoginForm({configured,linkError,googleReady}:{configured:boolean;linkError:boolean;googleReady:boolean}) {
 const [mode,setMode]=useState<Mode>('signin');
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [confirmation,setConfirmation]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(linkError?'Sign-in could not be completed. Try again, or request a new email link.':'');
 const [message,setMessage]=useState('');
 async function googleSignIn(){
  setBusy(true);setError('');setMessage('');
  try{
   const origin=process.env.NEXT_PUBLIC_SITE_URL||location.origin;
   const {error}=await createClient().auth.signInWithOAuth({provider:'google',options:{redirectTo:emailCallback(origin)}});
   if(error)throw error;
  }catch{setError('Google sign-in could not start. Please try again, or use email sign-in.');setBusy(false);}
 }
 function switchMode(next:Mode){setMode(next);setError('');setMessage('');setPassword('');setConfirmation('');}
 async function submit(event:FormEvent){
  event.preventDefault();setError('');setMessage('');
  if(mode==='signup'&&password!==confirmation){setError('The passwords do not match.');return;}
  setBusy(true);
  try {
   const auth=createClient().auth;
   const address=email.trim();
   const origin=process.env.NEXT_PUBLIC_SITE_URL||location.origin;
   if(mode==='reset'){
    const {error}=await auth.resetPasswordForEmail(address,{redirectTo:emailCallback(origin,true)});
    if(error)throw error;
    setMessage('If an account exists for this email, you will receive a password-reset link. Open it in this browser.');
   }else if(mode==='signup'){
    const {data,error}=await auth.signUp({email:address,password,options:{emailRedirectTo:emailCallback(origin)}});
    if(error)throw error;
    if(data.session){location.assign('/');return;}
    setPassword('');setConfirmation('');
    setMessage('Check your email for a confirmation link and open it in this browser. If you already have an account, sign in or reset your password.');
   }else{
    const {error}=await auth.signInWithPassword({email:address,password});
    if(error)throw error;
    location.assign('/');
   }
  }catch(error){setError(authMessage(error));}finally{setBusy(false);}
 }
 async function resend(){
  if(!email.trim()){setError('Enter your email address first.');return;}
  setBusy(true);setError('');setMessage('');
  try{
   const origin=process.env.NEXT_PUBLIC_SITE_URL||location.origin;
   const {error}=await createClient().auth.resend({type:'signup',email:email.trim(),options:{emailRedirectTo:emailCallback(origin)}});
   if(error)throw error;
   setMessage('If this account needs confirmation, a new link will arrive by email. Open it in this browser.');
  }catch(error){setError(authMessage(error));}finally{setBusy(false);}
 }
 return <>
  <button type="button" className="button primary full" disabled={!configured||!googleReady||busy} onClick={()=>void googleSignIn()}>Continue with Google</button>
  {!googleReady&&<p className="fine-print">Google sign-in is awaiting setup by the app owner. You can use email sign-in below.</p>}

  <p>{mode==='signup'?'Create your private Skill Passport account.':mode==='reset'?'Enter your email to reset your password.':'Sign in with your email and password.'}</p>
  <div className="auth-switch" aria-label="Account options"><button type="button" className={`button ${mode==='signin'?'primary':'outline'}`} disabled={busy} onClick={()=>switchMode('signin')}>Sign in</button><button type="button" className={`button ${mode==='signup'?'primary':'outline'}`} disabled={busy} onClick={()=>switchMode('signup')}>Create account</button></div>
  {!configured&&<p role="alert">The owner needs to finish Supabase setup. See the deployment guide.</p>}
  <form onSubmit={submit} className="auth-form">
   <label htmlFor="auth-email">Email address</label><input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} value={email} onChange={e=>setEmail(e.target.value)}/>
   {mode!=='reset'&&<><label htmlFor="auth-password">Password{mode==='signup'?' (at least 8 characters)':''}</label><input id="auth-password" name="password" type="password" autoComplete={mode==='signup'?'new-password':'current-password'} required minLength={mode==='signup'?8:1} maxLength={128} disabled={busy} value={password} onChange={e=>setPassword(e.target.value)}/></>}
   {mode==='signup'&&<><label htmlFor="auth-confirmation">Confirm password</label><input id="auth-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></>}
   {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="auth-message" role="status">{message}</p>}
   <button className="button primary full" disabled={!configured||busy}>{busy?'Please wait…':mode==='signup'?'Create account':mode==='reset'?'Send reset link':'Sign in'}</button>
  </form>
  <div className="auth-links"><button type="button" className="text-button" disabled={busy} onClick={()=>switchMode('reset')}>Forgot password?</button><button type="button" className="text-button" disabled={!configured||busy} onClick={()=>void resend()}>Resend confirmation email</button></div>
  <p className="fine-print">Your account is managed securely by Supabase. After renewing a session, return to your original tab and retry your action.</p><a href="/">Back to workspace</a>
 </>;
}

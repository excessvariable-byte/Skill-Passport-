import {authConfigured,authConfig} from '@/lib/supabase/config';
import LoginForm from './login-form';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
 const params=await searchParams;
 let googleReady=false;
 if(authConfigured()){
  try{
   const {url,key}=authConfig();
   const response=await fetch(`${url}/auth/v1/settings`,{headers:{apikey:key},cache:'no-store',signal:AbortSignal.timeout(5000)});
   if(response.ok){const settings=await response.json();googleReady=settings.external?.google===true;}
  }catch{/* Email sign-in remains available if the provider check is unavailable. */}
 }

 return <main className="login-page"><section className="panel login-card"><a className="eyebrow" href="/">SKILL PASSPORT</a><h1>Welcome back.</h1><LoginForm configured={authConfigured()} linkError={!!params.error} googleReady={googleReady}/><a className="guide-nav" href="/guide">Setup & deployment guide</a></section></main>;
}

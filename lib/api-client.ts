'use client';
import {createClient} from '@/lib/supabase/client';
export async function apiRequest(url:string, init:RequestInit={}) {
  const send=()=>fetch(url,{...init,cache:'no-store',signal:AbortSignal.timeout(20000)});
  try {
    let response=await send();
    if(response.status===401){
      const {data,error}=await createClient().auth.refreshSession();
      if(!error&&data.session)response=await send();
      if(response.status===401)window.dispatchEvent(new Event('passport-session-ended'));
    }
    return response;
  } catch {throw new Error('Could not reach the service. Your form is still open. Check your connection and retry.');}
}

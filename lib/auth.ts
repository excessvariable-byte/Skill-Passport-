import {cache} from 'react';
import {createClient} from '@/lib/supabase/server';
import {authConfigured} from '@/lib/supabase/config';
export const getIdentity=cache(async()=>{
  if(!authConfigured())return {user:null,unavailable:true};
  try {
    const supabase=await createClient();
    const {data,error}=await supabase.auth.getClaims();
    if(error)return {user:null,unavailable:!!error.status&&error.status>=500};
    const claims=data?.claims;
    if(!claims?.sub)return {user:null,unavailable:false};
    return {user:{userId:claims.sub,email:typeof claims.email==='string'?claims.email:'',displayName:typeof claims.user_metadata?.full_name==='string'?claims.user_metadata.full_name:typeof claims.email==='string'?claims.email:'My account'},unavailable:false};
  } catch {return {user:null,unavailable:true};}
});

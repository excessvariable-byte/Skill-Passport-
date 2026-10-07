import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {authConfig} from './config';
export async function createClient() {
  const store=await cookies();
  const {url,key}=authConfig();
  return createServerClient(url,key,{
    cookies:{
      getAll:()=>store.getAll(),
      setAll(values){
        try { for(const {name,value,options} of values) store.set(name,value,options); }
        catch { /* Server Components cannot write. proxy.ts refreshes their cookies. */ }
      }
    }
  });
}

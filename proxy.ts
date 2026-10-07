import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
import {authConfigured,authConfig} from '@/lib/supabase/config';
export async function proxy(request:NextRequest) {
  let response=NextResponse.next({request});
  if(!authConfigured())return response;
  const {url,key}=authConfig();
  const supabase=createServerClient(url,key,{
    cookies:{
      getAll:()=>request.cookies.getAll(),
      setAll(values){
        values.forEach(({name,value})=>request.cookies.set(name,value));
        response=NextResponse.next({request});
        values.forEach(({name,value,options})=>response.cookies.set(name,value,options));
      }
    }
  });
  // Refresh before rendering; do not discard the response carrying new cookies.
  try { await supabase.auth.getClaims(); }
  catch { /* APIs verify again and return a recoverable error; no redirect loop. */ }
  response.headers.set('Cache-Control','private, no-store, max-age=0');
  response.headers.set('Pragma','no-cache');
  response.headers.set('Expires','0');
  return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|md)$).*)']};

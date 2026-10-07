import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {safeReturnTo} from '@/lib/auth-redirect';
export async function GET(request:NextRequest) {
  const url=new URL(request.url);
  const origin=url.origin;
  const next=safeReturnTo(url.searchParams.get('next')||request.cookies.get('passport-return-to')?.value||'/employee');
  const code=url.searchParams.get('code');
  if(code){
    try {
      const supabase=await createClient();
      const {error}=await supabase.auth.exchangeCodeForSession(code);
      if(!error){const response=NextResponse.redirect(new URL(next,origin));response.cookies.delete('passport-return-to');response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');return response;}
    }catch { /* Show a readable retry page; never print credentials or codes. */ }
  }
  const login=new URL('/login',origin);login.searchParams.set('error',url.searchParams.get('error')==='access_denied'?'cancelled':'link');login.searchParams.set('next',next);
  const response=NextResponse.redirect(login);
  response.cookies.delete('passport-return-to');
  response.headers.set('Cache-Control','private, no-store');
  return response;
}

import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {appOrigin,safeReturnTo} from '@/lib/auth-redirect';
export async function GET(request:Request) {
  const url=new URL(request.url);
  const origin=appOrigin(request.url);
  const code=url.searchParams.get('code');
  if(code){
    try {
      const supabase=await createClient();
      const {error}=await supabase.auth.exchangeCodeForSession(code);
      if(!error){const response=NextResponse.redirect(new URL(safeReturnTo(url.searchParams.get('next')),origin));response.headers.set('Cache-Control','private, no-store');return response;}
    }catch { /* Show a readable retry page; never print credentials or codes. */ }
  }
  const response=NextResponse.redirect(new URL('/login?error=link',origin));
  response.headers.set('Cache-Control','private, no-store');
  return response;
}

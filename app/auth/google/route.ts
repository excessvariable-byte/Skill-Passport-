import {NextResponse, type NextRequest} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {safeReturnTo} from '@/lib/auth-redirect';

export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  const origin=new URL(request.url).origin;
  const next=safeReturnTo(request.nextUrl.searchParams.get('next')||'/employee');
  try {
    const db=await createClient();
    // Start and finish on the same host: the PKCE verifier is a host-only cookie.
    const {data,error}=await db.auth.signInWithOAuth({provider:'google',options:{
      redirectTo:new URL('/auth/callback',origin).href,
      skipBrowserRedirect:true,
      queryParams:{prompt:'select_account'},
    }});
    if(error||!data.url)throw new Error('OAuth unavailable');
    const response=NextResponse.redirect(data.url);
    response.cookies.set('passport-return-to',next,{httpOnly:true,secure:origin.startsWith('https:'),sameSite:'lax',path:'/',maxAge:600});
    response.headers.set('Cache-Control','private, no-store');
    response.headers.set('Referrer-Policy','no-referrer');
    return response;
  }catch{
    const login=new URL('/login',origin);login.searchParams.set('error','google');login.searchParams.set('next',next);
    const response=NextResponse.redirect(login);response.headers.set('Cache-Control','private, no-store');return response;
  }
}

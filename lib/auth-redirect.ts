/** Only allow app-relative return paths. Never trust a raw email redirect target. */
export function safeReturnTo(value:string|null|undefined):string {
  if(!value||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return '/';
  try {const url=new URL(value,'https://skill-passport.invalid');
    if(url.origin!=='https://skill-passport.invalid'||/^\/(?:auth|login)(?:\/|$)/.test(url.pathname))return '/';
    return url.pathname+url.search+url.hash;
  } catch { return '/'; }
}
export function appOrigin(requestUrl:string) {
  const origin=new URL(process.env.NEXT_PUBLIC_SITE_URL||requestUrl);
  if(!['http:','https:'].includes(origin.protocol))throw new Error('Invalid application URL');
  return origin.origin;
}

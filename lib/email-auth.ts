export function emailCallback(origin:string,recovery=false){
 const url=new URL('/auth/callback',origin);
 if(recovery)url.searchParams.set('next','/reset-password');
 return url.href;
}
export function authMessage(error:unknown):string {
 const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):'';
 switch(code){
  case 'invalid_credentials':return 'The email or password is incorrect. Please try again.';
  case 'email_not_confirmed':return 'Confirm your email before signing in. Check your inbox or resend the confirmation email.';
  case 'weak_password':return 'Choose a stronger password with at least 8 characters, including letters, numbers and symbols.';
  case 'user_already_exists':return 'Unable to create this account. Try signing in or resetting your password.';
  case 'over_email_send_rate_limit':case 'over_request_rate_limit':return 'Too many attempts. Please wait before trying again.';
  case 'email_address_not_authorized':return 'Email delivery is not ready for this address. The project owner needs to configure Supabase email delivery.';
  case 'signup_disabled':return 'New accounts are currently disabled. Contact the project owner.';
  case 'same_password':return 'Choose a password different from your current password.';
  default:return 'Could not complete this request. Check your connection and try again. If it continues, contact the project owner.';
 }
}

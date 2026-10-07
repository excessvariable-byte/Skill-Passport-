import {redirect} from 'next/navigation';
import {getIdentity} from '@/lib/auth';
import ResetPasswordForm from './reset-form';
export const dynamic='force-dynamic';
export default async function ResetPassword(){
 const {user}=await getIdentity();
 if(!user)redirect('/login?error=link');
 return <main className="login-page"><section className="panel login-card"><a className="eyebrow" href="/">SKILL PASSPORT</a><h1>Set a new password.</h1><ResetPasswordForm/></section></main>;
}

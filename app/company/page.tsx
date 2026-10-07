import {getIdentity} from '@/lib/auth';
import Portal from '../portal';
export const dynamic='force-dynamic';
export default async function Company(){const {user}=await getIdentity();return <Portal mode="company" userId={user?.userId??null} accountName={user?.displayName??'Guest'}/>;}

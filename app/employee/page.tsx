import {getIdentity} from '@/lib/auth';
import Portal from '../portal';
export const dynamic='force-dynamic';
export default async function Employee(){const {user}=await getIdentity();return <Portal mode="employee" userId={user?.userId??null} accountName={user?.displayName??'Guest'}/>;}

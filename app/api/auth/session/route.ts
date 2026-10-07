import {identity,guard,json} from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(){return guard(async()=>{await identity();return json({signedIn:true});});}

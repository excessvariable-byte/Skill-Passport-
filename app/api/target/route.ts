import {guard,identity,json,database,body,ApiError,checkDatabase} from '@/lib/server';
import {targetSchema} from '@/lib/validation';
export async function PUT(req:Request){return guard(async()=>{
 const u=await identity();const parsed=targetSchema.safeParse(await body(req));if(!parsed.success)throw new ApiError(400,'Choose a listed role and destination.');
 const db=await database();const {data,error}=await db.from('profiles').update({target_role:parsed.data.roleId,destination:parsed.data.destination,updated_at:new Date().toISOString()}).eq('owner_id',u.userId).select('owner_id');
 checkDatabase(error);if(!data?.length)throw new ApiError(404,'Save your work profile first.');return json({saved:true});
});}

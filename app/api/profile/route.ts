import {guard,identity,json,database,body,ApiError,checkDatabase} from '@/lib/server';
import {profileSchema} from '@/lib/validation';
export async function PUT(req:Request){return guard(async()=>{
 const u=await identity();const parsed=profileSchema.safeParse(await body(req));
 if(!parsed.success)throw new ApiError(400,parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '));
 const p=parsed.data;const db=await database();
 const {error}=await db.from('profiles').upsert({owner_id:u.userId,name:p.name,home_city:p.homeCity,destination:p.destination,months:p.months,deliveries:p.deliveries,rating:p.rating,on_time:p.onTime,payments:p.payments,consent:p.consent,is_sample:p.isSample,target_role:p.targetRole,updated_at:new Date().toISOString()},{onConflict:'owner_id'});
 checkDatabase(error);return json({saved:true});
});}

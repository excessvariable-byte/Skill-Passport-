import {guard,identity,json,database,body,ApiError,loadProfile,checkDatabase} from '@/lib/server';
import {trainingSchema} from '@/lib/validation';
export async function POST(req:Request){return guard(async()=>{
 const u=await identity();const parsed=trainingSchema.safeParse(await body(req));if(!parsed.success)throw new ApiError(400,'Choose a listed course.');
 if(!await loadProfile(u.userId))throw new ApiError(404,'Save your work profile first.');
 const db=await database();const {error}=await db.from('credentials').upsert({owner_id:u.userId,course_id:parsed.data.courseId},{onConflict:'owner_id,course_id',ignoreDuplicates:true});
 checkDatabase(error);return json({saved:true,status:'demo_credential'});
});}

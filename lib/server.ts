import {getIdentity} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {authConfigured} from '@/lib/supabase/config';
import {type Profile,inferSkills,matchRoles,courses,jobs,cohortSummary} from './catalog';
export class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
export async function database(){
  if(!authConfigured())throw new ApiError(503,'Supabase setup is not complete. Follow the deployment guide.');
  return createClient();
}
export async function identity(){
  const {user,unavailable}=await getIdentity();
  if(unavailable)throw new ApiError(503,'Sign-in is temporarily unavailable. Your saved data is safe; please retry.');
  if(!user)throw new ApiError(401,'Your session has ended. Sign in again to continue.');
  return user;
}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});}
export async function guard(fn:()=>Promise<Response>){try{return await fn();}catch(error){
  if(error instanceof ApiError)return json({error:error.message},error.status);
  console.error('Skill Passport request failed:',error instanceof Error?error.name:'storage error');
  return json({error:'The service is temporarily unavailable. Please retry. Your form has been kept open.'},503);
}}
export function checkDatabase(error:{code?:string;message?:string}|null){
  if(!error)return;
  if(error.code==='42P01'||error.code==='PGRST205'||error.code==='42703'||error.code==='PGRST204')throw new ApiError(503,'The selected database is missing the employee/company schema. Check the Supabase project URL and the installed migration version.');
  if(error.code==='42501')throw new ApiError(403,'You do not have access to this record.');
  console.error('Database operation failed:',error.code??'unknown');
  throw new ApiError(503,'The database could not complete this request. Please retry.');
}
export async function body(req:Request){
  const expectedOwner=req.headers.get('x-passport-owner');
  if(expectedOwner&&expectedOwner!==(await identity()).userId)throw new ApiError(409,'Your account changed. Reload the workspace before saving.');
  const origin=req.headers.get('origin');
  if(origin&&origin!==new URL(req.url).origin)throw new ApiError(403,'This request came from a different website.');
  if(!req.headers.get('content-type')?.startsWith('application/json'))throw new ApiError(415,'Send application/json.');
  const reader=req.body?.getReader();if(!reader)throw new ApiError(400,'A JSON body is required.');
  let size=0;const chunks:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new ApiError(413,'The request is too large.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,'Invalid JSON.');}
}
export async function loadProfile(owner:string):Promise<Profile|null>{
  const supabase=await database();
  const {data:r,error}=await supabase.from('profiles').select('*').eq('owner_id',owner).maybeSingle();checkDatabase(error);
  if(!r)return null;
  return {name:r.name,homeCity:r.home_city,destination:r.destination,months:r.months,deliveries:r.deliveries,rating:r.rating,onTime:r.on_time,payments:r.payments,consent:r.consent,isSample:r.is_sample,targetRole:r.target_role,updatedAt:r.updated_at};
}
export async function workspace(owner:string){
  const supabase=await database();
  const [profile,{data,error}]=await Promise.all([loadProfile(owner),supabase.from('credentials').select('id, course_id, completed_at').eq('owner_id',owner).order('completed_at',{ascending:false})]);checkDatabase(error);
  const certificates=(data??[]).map(c=>({id:c.id,courseId:c.course_id,completedAt:c.completed_at}));
  const workerSkills=profile?inferSkills(profile,certificates.map(c=>c.courseId)):[];
  return {profile,certificates,skills:workerSkills,roles:matchRoles(workerSkills),courses,jobs,cohort:cohortSummary(),engine:'rules',generatedAt:new Date().toISOString()};
}

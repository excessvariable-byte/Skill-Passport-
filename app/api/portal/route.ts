import {z} from 'zod';
import {body,guard,identity,json,ApiError,checkDatabase} from '@/lib/server';
import {createClient} from '@/lib/supabase/server';
import {PROFILE_COLUMNS,ANALYTICS_COLUMNS,ROLE_NAMES} from '@/lib/portal-types';
export const dynamic='force-dynamic';
const text=(n:number)=>z.string().trim().min(2).max(n);
const schemas=z.discriminatedUnion('action',[
 z.object({action:z.literal('profile'),display_name:text(80),headline:z.string().trim().max(160),location:z.string().trim().max(80),experience_years:z.number().min(0).max(60),target_role:z.enum(ROLE_NAMES),training_consent:z.boolean()}),
 z.object({action:z.literal('log'),skill:text(80),kind:z.enum(['technical','communication']),score:z.number().min(0).max(100),practiced_at:z.string().datetime({offset:true}).refine(s=>new Date(s)<=new Date()&&new Date(s)>=new Date('2000-01-01'),'Choose a past practice date'),evidence_note:z.string().trim().max(500)}),
 z.object({action:z.literal('task'),project_name:text(100),complexity:z.number().min(1).max(5),baseline_capacity:z.number().min(1).max(5)}),
 z.object({action:z.literal('share'),company_id:z.string().uuid()}),z.object({action:z.literal('unshare'),company_id:z.string().uuid()}),
 z.object({action:z.literal('company'),name:text(100),industry:text(80)}),
 z.object({action:z.literal('role'),title:text(100),location:text(80),description:z.string().trim().min(10).max(2000),skills:z.array(text(60)).min(1).max(12)}),
 z.object({action:z.literal('assignment'),senior_id:z.string().uuid(),junior_id:z.string().uuid(),skill:text(80),project_name:text(100),starts_at:z.string().datetime({offset:true}),ends_at:z.string().datetime({offset:true}).nullable()}),
 z.object({action:z.literal('delete_log'),id:z.string().uuid()}),z.object({action:z.literal('delete_role'),id:z.string().uuid()})
]);
export async function GET(req:Request){return guard(async()=>{
 const u=await identity();const db=await createClient();const companyMode=new URL(req.url).searchParams.get('mode')==='company';
 const [profile,analytics,logs,workload,companies,shares,roles,company,model]=await Promise.all([
 db.from('skill_passports').select(PROFILE_COLUMNS).eq('user_id',u.userId).maybeSingle(),
 db.from('user_skill_analytics').select(ANALYTICS_COLUMNS).eq('user_id',u.userId).maybeSingle(),
 db.from('skill_logs').select('id,user_id,skill,kind,score,source,practiced_at,evidence_note').eq('user_id',u.userId).order('practiced_at',{ascending:false}).limit(200),
 db.from('employee_workload_signals').select('ratio,status,workload_review_flag,observed_at').eq('user_id',u.userId).maybeSingle(),
 db.from('companies').select('id,owner_id,name,industry').order('name').limit(200),
 db.from('passport_shares').select('company_id,user_id').eq('user_id',u.userId),
 db.from('company_roles').select('id,company_id,title,location,description,skills').order('created_at',{ascending:false}).limit(100),
 db.from('companies').select('id,owner_id,name,industry').eq('owner_id',u.userId).maybeSingle(),
 db.from('model_registry').select('version,data_source,trained_at').eq('model_name','skill_passport_readiness_v2').eq('is_active',true).eq('data_source','supabase').maybeSingle()
 ]);for(const r of [profile,analytics,logs,workload,companies,shares,roles,company,model])checkDatabase(r.error);
 let people:unknown[]=[],peopleAnalytics:unknown[]=[],assignments:unknown[]=[];
 if(companyMode&&company.data){
  const shared=await db.from('passport_shares').select('user_id').eq('company_id',company.data.id).limit(200);checkDatabase(shared.error);
  const ids=(shared.data??[]).map(r=>r.user_id);
  if(ids.length){const [p,a]=await Promise.all([db.from('skill_passports').select(PROFILE_COLUMNS).in('user_id',ids).order('display_name'),db.from('user_skill_analytics').select(ANALYTICS_COLUMNS).in('user_id',ids).eq('is_synthetic',false)]);checkDatabase(p.error);checkDatabase(a.error);people=p.data??[];peopleAnalytics=a.data??[];}
  const assignmentsResult=await db.from('peer_assignments').select('id,senior_id,junior_id,skill,project_name,starts_at,ends_at').eq('company_id',company.data.id).limit(200);checkDatabase(assignmentsResult.error);assignments=assignmentsResult.data??[];
 }
 const currentWorkload=workload.data?.observed_at&&Date.now()-new Date(workload.data.observed_at).getTime()<=30*86400000?workload.data:null;
 return json({profile:profile.data,analytics:analytics.data,logs:logs.data,workload:currentWorkload,companies:companies.data,shares:shares.data,roles:roles.data,company:company.data,people,peopleAnalytics,assignments,model:model.data});
});}
export async function POST(req:Request){return guard(async()=>{
 const u=await identity();const parsed=schemas.safeParse(await body(req));
 if(!parsed.success)throw new ApiError(400,parsed.error.issues.map(i=>i.message).join('; '));
 const {action,...data}=parsed.data;const db=await createClient();let error;
 switch(action){
  case 'profile':{
   const payload=parsed.data;const {action:_,...profile}=payload;
   const existing=await db.from('skill_passports').select('user_id').eq('user_id',u.userId).maybeSingle();checkDatabase(existing.error);
   ({error}=existing.data?await db.from('skill_passports').update(profile).eq('user_id',u.userId):await db.from('skill_passports').insert({user_id:u.userId,...profile}));break;}
  case 'log':{
   const profileCheck=await db.from('skill_passports').select('user_id').eq('user_id',u.userId).maybeSingle();checkDatabase(profileCheck.error);
   if(!profileCheck.data){
    const initProfile=await db.from('skill_passports').insert({user_id:u.userId,display_name:u.displayName||'Employee',headline:'',location:'',experience_years:0,target_role:'Data Analyst',training_consent:false});
    checkDatabase(initProfile.error);
   }
   ({error}=await db.from('skill_logs').insert({user_id:u.userId,...data}));break;}
  case 'task':{
   const profileCheck=await db.from('skill_passports').select('user_id').eq('user_id',u.userId).maybeSingle();checkDatabase(profileCheck.error);
   if(!profileCheck.data){
    const initProfile=await db.from('skill_passports').insert({user_id:u.userId,display_name:u.displayName||'Employee',headline:'',location:'',experience_years:0,target_role:'Data Analyst',training_consent:false});
    checkDatabase(initProfile.error);
   }
   ({error}=await db.from('project_tasks').insert({user_id:u.userId,...data}));break;}
  case 'share':({error}=await db.from('passport_shares').upsert({user_id:u.userId,...data},{onConflict:'user_id,company_id',ignoreDuplicates:true}));break;
  case 'unshare':({error}=await db.from('passport_shares').delete().eq('user_id',u.userId).eq('company_id',parsed.data.company_id));break;
  case 'company':({error}=await db.from('companies').insert({owner_id:u.userId,...data}));break;
  case 'delete_log':({error}=await db.from('skill_logs').delete().eq('user_id',u.userId).eq('id',parsed.data.id));break;
  default:{
   const own=await db.from('companies').select('id').eq('owner_id',u.userId).maybeSingle();checkDatabase(own.error);if(!own.data)throw new ApiError(403,'Create your company workspace first.');
   if(action==='role')({error}=await db.from('company_roles').insert({company_id:own.data.id,...data}));
   if(action==='delete_role')({error}=await db.from('company_roles').delete().eq('company_id',own.data.id).eq('id',parsed.data.id));
   if(action==='assignment'){
    if(parsed.data.senior_id===parsed.data.junior_id)throw new ApiError(400,'Choose two different people.');
    if(parsed.data.ends_at&&new Date(parsed.data.ends_at)<=new Date(parsed.data.starts_at))throw new ApiError(400,'End date must be after start date.');
    ({error}=await db.from('peer_assignments').insert({company_id:own.data.id,...data}));
   }
  }
 }
 if(error?.code==='23505')throw new ApiError(409,'This record already exists.');
 if(error?.code==='23503')throw new ApiError(400,'Create your employee profile before adding evidence.');
 checkDatabase(error??null);return json({saved:true});
});}

import {guard,identity,json,database,checkDatabase} from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(){return guard(async()=>{
 const u=await identity();const db=await database();
 const [profile,companies,model]=await Promise.all([
  db.from('skill_passports').select('user_id,display_name').eq('user_id',u.userId).limit(1),
  db.from('companies').select('id').limit(1),
  db.from('model_registry').select('version,data_source').eq('model_name','skill_passport_readiness_v2').eq('is_active',true).eq('data_source','supabase').maybeSingle()
 ]);
 for(const r of [profile,companies,model])checkDatabase(r.error);
 const inferenceConfigured=Boolean(process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY);
 return json({status:model.data&&inferenceConfigured?'ready':'setup_required',schema:'employee_company_ml',database:'Supabase PostgreSQL',authentication:'Supabase Auth',training:'Google Colab (offline)',inference:{endpoint:'/api/inference',serverSecretConfigured:inferenceConfigured,activeModel:model.data?.version??null},note:'This verifies schema access and configuration. Use an authenticated scoring request to verify the Python runtime.'});
});}

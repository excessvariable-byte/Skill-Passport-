-- Extend the supplied schema in place; existing delivery passports and market data are preserved.
begin;
alter table public.skill_passports add column display_name text not null default '' check(char_length(display_name)<=80);
alter table public.skill_passports add column headline text not null default '' check(char_length(headline)<=160);
alter table public.skill_passports add column location text not null default '' check(char_length(location)<=80);
alter table public.skill_passports add column training_consent boolean not null default false;
alter table public.skill_passports add constraint skill_passports_auth_user_fk foreign key(user_id) references auth.users(id) on delete cascade;

create table public.companies (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(name) between 2 and 100), industry text not null default 'Technology' check(char_length(industry)<=80),
 created_at timestamptz not null default now(), unique(owner_id)
);
create table public.passport_shares (
 user_id uuid not null references public.skill_passports(user_id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(user_id,company_id)
);
create index passport_shares_company_idx on public.passport_shares(company_id,user_id);
create table public.skill_logs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.skill_passports(user_id) on delete cascade,
 skill text not null check(char_length(skill) between 2 and 80),kind text not null check(kind in ('technical','communication')),
 score numeric not null check(score between 0 and 100),source text not null default 'self_reported' check(source in ('self_reported','verified')),
 practiced_at timestamptz not null check(practiced_at>='2000-01-01'),recorded_at timestamptz not null default now(),
 evidence_note text not null default '' check(char_length(evidence_note)<=500)
);
create index skill_logs_user_date_idx on public.skill_logs(user_id,practiced_at desc);
create table public.project_tasks (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.skill_passports(user_id) on delete cascade,
 project_name text not null check(char_length(project_name) between 2 and 100),complexity numeric not null check(complexity between 1 and 5),
 baseline_capacity numeric not null check(baseline_capacity between 1 and 5),observed_at timestamptz not null default now(),recorded_at timestamptz not null default now()
);
create index project_tasks_user_date_idx on public.project_tasks(user_id,observed_at desc);
create table public.peer_assignments (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
 senior_id uuid not null references public.skill_passports(user_id) on delete cascade,
 junior_id uuid not null references public.skill_passports(user_id) on delete cascade,
 skill text not null check(char_length(skill) between 2 and 80),project_name text not null check(char_length(project_name) between 2 and 100),
 starts_at timestamptz not null,ends_at timestamptz,recorded_at timestamptz not null default now(),
 check(senior_id<>junior_id),check(ends_at is null or ends_at>starts_at),unique(company_id,senior_id,junior_id,skill,starts_at)
);
create index peer_assignments_senior_idx on public.peer_assignments(senior_id);
create index peer_assignments_junior_idx on public.peer_assignments(junior_id);
create table public.company_roles (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
 title text not null check(char_length(title) between 2 and 100),location text not null default 'Remote' check(char_length(location)<=80),
 description text not null check(char_length(description) between 10 and 2000),skills text[] not null default '{}',
 published boolean not null default true,created_at timestamptz not null default now()
);
create index company_roles_company_idx on public.company_roles(company_id);
create table public.employee_workload_signals (
 user_id uuid primary key references public.skill_passports(user_id) on delete cascade,
 observed_at timestamptz,ratio numeric,workload_review_flag boolean not null default false,status text not null,
 scored_at timestamptz not null default now(),check(ratio is null or ratio between 0.2 and 5)
);
create table public.training_examples (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.skill_passports(user_id) on delete cascade,
 feature_snapshot jsonb not null,contract_version text not null,feature_as_of timestamptz not null,
 readiness_label numeric not null check(readiness_label between 0 and 100),label_observed_at timestamptz not null,
 label_source text not null check(label_source='independent_assessment'),created_at timestamptz not null default now(),
 check(label_observed_at>feature_as_of),unique(user_id,feature_as_of,label_observed_at)
);
create index training_examples_user_idx on public.training_examples(user_id);
create table public.inference_requests(user_id uuid primary key references auth.users(id) on delete cascade,last_requested_at timestamptz not null);

-- Retire the old classifier fields without deleting any existing records.
alter table public.user_skill_analytics alter column stagnation_prob drop not null;
alter table public.user_skill_analytics add column technical_index numeric check(technical_index between 0 and 100);
alter table public.user_skill_analytics add column communication_score numeric check(communication_score between 0 and 100);
alter table public.user_skill_analytics add column task_fit_score numeric check(task_fit_score between 0 and 100);
alter table public.user_skill_analytics add column weighted_readiness_score numeric check(weighted_readiness_score between 0 and 100);
alter table public.user_skill_analytics add column leadership_readiness_score numeric check(leadership_readiness_score between 0 and 100);
alter table public.user_skill_analytics add column mentorship jsonb not null default '{}';
alter table public.user_skill_analytics add column skill_decay jsonb not null default '[]';
alter table public.user_skill_analytics add column skill_gaps jsonb not null default '[]';
alter table public.user_skill_analytics add column data_quality jsonb not null default '{}';
alter table public.user_skill_analytics add column input_hash text;
alter table public.user_skill_analytics add column feature_as_of timestamptz;
alter table public.user_skill_analytics add constraint analytics_auth_user_fk foreign key(user_id) references auth.users(id) on delete cascade;

alter table public.companies enable row level security;
alter table public.passport_shares enable row level security;
alter table public.skill_logs enable row level security;
alter table public.project_tasks enable row level security;
alter table public.peer_assignments enable row level security;
alter table public.company_roles enable row level security;
alter table public.employee_workload_signals enable row level security;
alter table public.training_examples enable row level security;
alter table public.inference_requests enable row level security;
revoke all on public.companies,public.passport_shares,public.skill_logs,public.project_tasks,public.peer_assignments,public.company_roles,public.employee_workload_signals,public.training_examples,public.inference_requests from anon,authenticated;
revoke all on public.skill_passports,public.user_skills,public.user_skill_analytics,public.model_registry from anon,authenticated;
grant select on public.companies,public.passport_shares,public.skill_logs,public.project_tasks,public.peer_assignments,public.company_roles,public.employee_workload_signals to authenticated;
grant insert(owner_id,name,industry) on public.companies to authenticated;
grant insert(user_id,company_id),delete on public.passport_shares to authenticated;
grant insert(user_id,skill,kind,score,practiced_at,evidence_note),delete on public.skill_logs to authenticated;
grant insert(user_id,project_name,complexity,baseline_capacity),delete on public.project_tasks to authenticated;
grant insert(company_id,senior_id,junior_id,skill,project_name,starts_at,ends_at),delete on public.peer_assignments to authenticated;
grant insert(company_id,title,location,description,skills),delete on public.company_roles to authenticated;
grant select(user_id,display_name,headline,location,experience_years,target_role,training_consent,updated_at) on public.skill_passports to authenticated;
grant insert(user_id,display_name,headline,location,experience_years,target_role,training_consent),update(display_name,headline,location,experience_years,target_role,training_consent) on public.skill_passports to authenticated;
grant select(user_id,role_readiness_pred,readiness_band,technical_index,communication_score,task_fit_score,weighted_readiness_score,leadership_readiness_score,mentorship,skill_decay,skill_gaps,data_quality,explanation,input_hash,feature_as_of,model_version,is_synthetic,scored_at) on public.user_skill_analytics to authenticated;
grant select(model_name,version,data_source,is_active,trained_at,n_train,features,metrics,notes) on public.model_registry to authenticated;
grant all on public.companies,public.passport_shares,public.skill_logs,public.project_tasks,public.peer_assignments,public.company_roles,public.employee_workload_signals,public.training_examples,public.inference_requests to service_role;

create policy companies_directory on public.companies for select to authenticated using(true);
create policy companies_owner_insert on public.companies for insert to authenticated with check(owner_id=(select auth.uid()));
create policy shares_read on public.passport_shares for select to authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy shares_insert_own on public.passport_shares for insert to authenticated with check(user_id=(select auth.uid()));
create policy shares_delete_own on public.passport_shares for delete to authenticated using(user_id=(select auth.uid()));
create policy passports_create_own on public.skill_passports for insert to authenticated with check(user_id=(select auth.uid()));
create policy passports_update_own on public.skill_passports for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy passports_company_read on public.skill_passports for select to authenticated using(exists(select 1 from public.passport_shares s join public.companies c on c.id=s.company_id where s.user_id=skill_passports.user_id and c.owner_id=(select auth.uid())));
create policy analytics_company_read on public.user_skill_analytics for select to authenticated using(not is_synthetic and exists(select 1 from public.passport_shares s join public.companies c on c.id=s.company_id where s.user_id=user_skill_analytics.user_id and c.owner_id=(select auth.uid())));
create policy skill_logs_own_read on public.skill_logs for select to authenticated using(user_id=(select auth.uid()));
create policy skill_logs_own_insert on public.skill_logs for insert to authenticated with check(user_id=(select auth.uid()) and source='self_reported' and practiced_at<=now());
create policy skill_logs_own_delete on public.skill_logs for delete to authenticated using(user_id=(select auth.uid()) and source='self_reported');
create policy tasks_own_read on public.project_tasks for select to authenticated using(user_id=(select auth.uid()));
create policy tasks_own_insert on public.project_tasks for insert to authenticated with check(user_id=(select auth.uid()));
create policy tasks_own_delete on public.project_tasks for delete to authenticated using(user_id=(select auth.uid()));
create policy workload_own on public.employee_workload_signals for select to authenticated using(user_id=(select auth.uid()));
create policy roles_read on public.company_roles for select to authenticated using(published or exists(select 1 from public.companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy roles_owner_insert on public.company_roles for insert to authenticated with check(exists(select 1 from public.companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy roles_owner_delete on public.company_roles for delete to authenticated using(exists(select 1 from public.companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy assignments_read on public.peer_assignments for select to authenticated using(senior_id=(select auth.uid()) or junior_id=(select auth.uid()) or exists(select 1 from public.companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy assignments_company_insert on public.peer_assignments for insert to authenticated with check(
 exists(select 1 from public.companies c where c.id=company_id and c.owner_id=(select auth.uid()))
 and exists(select 1 from public.passport_shares s where s.company_id=peer_assignments.company_id and s.user_id=senior_id)
 and exists(select 1 from public.passport_shares s where s.company_id=peer_assignments.company_id and s.user_id=junior_id));
create policy assignments_company_delete on public.peer_assignments for delete to authenticated using(exists(select 1 from public.companies c where c.id=company_id and c.owner_id=(select auth.uid())));

create schema if not exists private;
create function private.touch_employee_evidence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='skill_passports' then NEW.updated_at=now();return NEW;end if;
 update public.skill_passports set updated_at=now() where user_id=coalesce(NEW.user_id,OLD.user_id);
 return coalesce(NEW,OLD);
end $$;
-- Trigger-only function: cannot be called through the API; updates only the affected owner timestamp.
revoke all on function private.touch_employee_evidence() from public,anon,authenticated;
create trigger passport_touch before update on public.skill_passports for each row execute function private.touch_employee_evidence();
create trigger skill_log_touch after insert or delete on public.skill_logs for each row execute function private.touch_employee_evidence();
create trigger project_task_touch after insert or delete on public.project_tasks for each row execute function private.touch_employee_evidence();

create function public.claim_inference_request(p_user_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 insert into public.inference_requests(user_id,last_requested_at) values(p_user_id,now())
 on conflict(user_id) do update set last_requested_at=excluded.last_requested_at
 where public.inference_requests.last_requested_at<now()-interval '60 seconds';
 return found;
end $$;
revoke all on function public.claim_inference_request(uuid) from public,anon,authenticated;
grant execute on function public.claim_inference_request(uuid) to service_role;

create function public.store_skill_analytics(p_analytics jsonb,p_workload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare uid uuid; changed timestamptz;asof timestamptz;
begin
 uid=(p_analytics->>'user_id')::uuid;asof=(p_analytics->>'feature_as_of')::timestamptz;
 select updated_at into strict changed from public.skill_passports where user_id=uid for update;
 if asof is null or changed>asof or asof>now()+interval '10 seconds' then raise exception 'Stale or invalid feature snapshot';end if;
 if p_workload->>'user_id'<>uid::text then raise exception 'Owner mismatch';end if;
 if coalesce((p_analytics->>'is_synthetic')::boolean,true) then raise exception 'Synthetic write forbidden';end if;
 if not exists(select 1 from public.model_registry where model_name='skill_passport_readiness_v2' and version=p_analytics->>'model_version' and is_active and data_source='supabase') then raise exception 'Model is not active';end if;
 insert into public.user_skill_analytics(user_id,role_readiness_pred,readiness_band,technical_index,communication_score,task_fit_score,weighted_readiness_score,leadership_readiness_score,mentorship,skill_decay,skill_gaps,data_quality,explanation,input_hash,feature_as_of,model_version,is_synthetic,scored_at)
 select x.user_id,x.role_readiness_pred,x.readiness_band,x.technical_index,x.communication_score,x.task_fit_score,x.weighted_readiness_score,x.leadership_readiness_score,x.mentorship,x.skill_decay,x.skill_gaps,x.data_quality,x.explanation,x.input_hash,x.feature_as_of,x.model_version,false,x.scored_at
 from jsonb_populate_record(null::public.user_skill_analytics,p_analytics) x
 on conflict(user_id) do update set role_readiness_pred=excluded.role_readiness_pred,readiness_band=excluded.readiness_band,technical_index=excluded.technical_index,communication_score=excluded.communication_score,task_fit_score=excluded.task_fit_score,weighted_readiness_score=excluded.weighted_readiness_score,leadership_readiness_score=excluded.leadership_readiness_score,mentorship=excluded.mentorship,skill_decay=excluded.skill_decay,skill_gaps=excluded.skill_gaps,data_quality=excluded.data_quality,explanation=excluded.explanation,input_hash=excluded.input_hash,feature_as_of=excluded.feature_as_of,model_version=excluded.model_version,is_synthetic=false,scored_at=excluded.scored_at
 where public.user_skill_analytics.feature_as_of is null or public.user_skill_analytics.feature_as_of<=excluded.feature_as_of;
 if not found then raise exception 'Newer analytics already exist';end if;
 insert into public.employee_workload_signals(user_id,observed_at,ratio,workload_review_flag,status,scored_at)
 select x.user_id,x.observed_at,x.ratio,x.workload_review_flag,x.status,x.scored_at from jsonb_populate_record(null::public.employee_workload_signals,p_workload) x
 on conflict(user_id) do update set observed_at=excluded.observed_at,ratio=excluded.ratio,workload_review_flag=excluded.workload_review_flag,status=excluded.status,scored_at=excluded.scored_at;
end $$;
revoke all on function public.store_skill_analytics(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.store_skill_analytics(jsonb,jsonb) to service_role;
commit;

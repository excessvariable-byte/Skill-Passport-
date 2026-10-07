
-- ═════════ Skill Passport ML schema ═════════
create table if not exists public.skill_passports (          -- INPUT table the notebook reads (skip if you already have one; keep these column names)
  user_id uuid primary key,
  verified_skills_count integer,
  core_tech_proficiency double precision check (core_tech_proficiency between 0 and 100),
  soft_skills_score double precision check (soft_skills_score between 0 and 100),
  project_complexity_score double precision check (project_complexity_score between 1 and 5),
  learning_velocity double precision check (learning_velocity >= 0),
  peer_review_rating double precision check (peer_review_rating between 1 and 5),
  target_role_skill_overlap double precision check (target_role_skill_overlap between 0 and 100),
  skill_gap_index double precision check (skill_gap_index between 0 and 100),
  experience_years double precision,                         -- optional extras (picked up automatically)
  months_since_last_practice double precision,
  target_level smallint check (target_level between 1 and 4),
  target_role text, role_family text,
  role_readiness_score double precision check (role_readiness_score between 0 and 100),   -- LABEL: real promotion/role-match outcome (nullable)
  flight_risk_or_stagnation smallint check (flight_risk_or_stagnation in (0,1)),          -- LABEL: observed stagnation/turnover (nullable)
  updated_at timestamptz not null default now()
);
create table if not exists public.user_skills (              -- OPTIONAL: per-skill levels → enables 'top skill gaps' in the diagnosis JSON
  user_id uuid not null, skill text not null, level numeric(2,1) check (level between 0 and 5), primary key (user_id, skill));

create table if not exists public.user_skill_analytics (     -- OUTPUT: what the Next.js app displays
  user_id uuid primary key,
  role_readiness_pred double precision not null, readiness_p10 double precision, readiness_p90 double precision, readiness_band text,
  stagnation_prob double precision not null, stagnation_risk_score smallint, stagnation_flag boolean, risk_band text,
  explanation jsonb not null,                                 -- full SHAP diagnosis from explain_user()
  model_version text not null, is_synthetic boolean not null default false, scored_at timestamptz not null default now());
create index if not exists user_skill_analytics_model_idx on public.user_skill_analytics (model_version);

create table if not exists public.model_registry (          -- OUTPUT: one row per trained bundle
  id bigint generated always as identity primary key,
  model_name text not null, version text not null,
  data_source text not null check (data_source in ('supabase','synthetic')),
  is_active boolean not null default false, trained_at timestamptz not null default now(), n_train integer,
  features jsonb not null, feature_spec jsonb, metrics jsonb not null, hyperparameters jsonb, feature_importance jsonb,
  thresholds jsonb, artifacts jsonb, notes text, unique (model_name, version));
create unique index if not exists model_registry_one_active on public.model_registry (model_name) where is_active;

-- Row-level security: the notebook uses the service_role key (bypasses RLS); the browser uses the anon key + user JWT.
alter table public.skill_passports       enable row level security;
alter table public.user_skills           enable row level security;
alter table public.user_skill_analytics  enable row level security;
alter table public.model_registry        enable row level security;
drop policy if exists "own passport"  on public.skill_passports;       create policy "own passport"  on public.skill_passports       for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own skills"    on public.user_skills;           create policy "own skills"    on public.user_skills           for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own analytics" on public.user_skill_analytics;  create policy "own analytics" on public.user_skill_analytics  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "read registry" on public.model_registry;        create policy "read registry" on public.model_registry        for select to authenticated using (true);

-- Realtime: lets the Vercel app update live when new scores land (Realtime respects the RLS policy above)
do $$ begin alter publication supabase_realtime add table public.user_skill_analytics; exception when duplicate_object then null; end $$;

-- Optional Storage bucket for ONNX files (private; the app fetches via a signed URL or a server route)
insert into storage.buckets (id, name, public) values ('models', 'models', false) on conflict (id) do nothing;

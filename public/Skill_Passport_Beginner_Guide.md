# Skill Passport — employee and company platform

## What is ready, and what still needs setup?

The source includes the redesigned employee and company websites, protected Next.js APIs, a Supabase migration, the four requested Python modules, a Colab notebook, local tests and setup instructions. The employee/company database migration is **applied and verified** in the existing Supabase project after explicit approval. Its recorded version is `20261007180805`. Vercel's installed connection currently returns **403 Forbidden** for the existing team; the local CLI has no credentials. This upgrade has **not been deployed** over the current production website.

The model pipeline has been exercised locally using synthetic test data. No real employee model has been trained or activated. The app's illustrative preview can be explored without logging in, but its people and scores are examples.

Before real scoring works, you need: access to the existing Vercel project; the server-only Supabase key configured in Vercel/Colab; consented skill evidence and independently assessed labels; and a reviewed, active real model. Supabase now reports Google sign-in enabled; a real login and callback test remains to be completed.

See `docs/ARCHITECTURE_MAP.md` for the complete route/table/platform connection map and current release gates.

## 1. Understand “full stack”

| Piece | What it does in this project |
|---|---|
| Frontend | Next.js + React + TypeScript: the screens, buttons, forms and charts employees and companies see. |
| API/backend | Next.js `/api/portal` validates the signed-in user and form input. Python `/api/inference` calculates scores. |
| Authentication | Supabase Auth identifies the person using email/password or configured Google sign-in. |
| Database | Supabase PostgreSQL stores profiles, evidence, company sharing and prepared analytics. Row-level security protects records. |
| Training | Google Colab runs Python, Optuna, XGBoost and SHAP. This is an occasional offline job, not a web request. |
| Inference | `onnxruntime` runs a previously trained model on current evidence. It does not retrain XGBoost. |
| Hosting | Vercel serves Next.js and the small Python inference endpoint in the existing project. |

Saving a skill works like this: the employee completes a form → the browser sends JSON to `/api/portal` → the backend verifies the Supabase session → it validates the form → Supabase applies database permissions and saves the row → the frontend refreshes.

Scoring works like this: the employee clicks **Refresh analytics** → the browser sends their access token to `/api/inference` → Python verifies the token with Supabase → it derives the user ID from that verified identity → it fetches evidence and the active ONNX model → it calculates scores and explanations → a transaction saves analytics and the private workload indicator → the frontend reads prepared results. A caller cannot choose a different employee's ID in the request body.

## 2. What each workspace does

**Employee:** create a profile and choose a target role; log technical and communication evidence; record a private task/capacity check; inspect model drivers, recency estimates and role gaps; browse published roles; share with specific companies or revoke sharing; optionally consent to future training.

**Company:** create one company workspace for the owner account; publish and remove roles; view only passports actively shared with that company; inspect prepared skill analytics and explanations; record a senior/junior pairing when both people share with the company.

Sharing does not expose raw private skill notes or workload checks. Companies do not get a burnout/flight-risk prediction. Revocation stops future database reads; it cannot recall information a recipient has already copied. This initial version supports one owner per company, not a multi-admin invitation system.

## 3. Find the files

```text
app/page.tsx                   Landing page
app/employee/page.tsx          Employee workspace entry
app/company/page.tsx           Company workspace entry
app/portal.tsx                 Interactive portal screens
app/portal.css                 Responsive design
app/api/portal/route.ts        Validated, authenticated record API
app/login/                    Supabase Google/email UI
app/auth/callback/             OAuth/email callback
api/inference.py              Vercel Python inference handler
ml/data_loader.py             Supabase reads and transactional publish
ml/feature_engineering.py     Shared mathematical feature definitions
ml/train_and_explain.py       Optuna + XGBoost + SHAP + ONNX export
ml/pipeline_runner.py         ONNX predictions + per-input explanations
ml/prepare_training_data.py   Real snapshot/assessment preparation
ml/Skill_Passport_Training.ipynb  Colab notebook
supabase/base_ml_schema.sql   Original supplied ML tables, for NEW databases
supabase/migrations/20261007180805_employee_company_ml.sql  Upgrade
```

The old delivery-worker implementation remains in the source for reference, but the new home and employee/company portals replace its navigation. The old `profiles` and `credentials` records are preserved. No historical delivery scores are silently presented as the new ML scores.

## 4. Run the frontend on your laptop

1. Install Node.js 24 LTS and VS Code.
2. Extract the complete source ZIP. Open the folder that contains `package.json` in VS Code.
3. Open **Terminal → New Terminal** and run:

```bash
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
```

4. Copy `.env.example` to `.env.local`. Never commit `.env.local`.
5. Add the public project URL and publishable key from Supabase → Project Settings / API Keys. These two values are intended for browser use; database policies enforce access.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://cctxrjmchntgbslnnhxp.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

6. Run:

```bash
pnpm dev
```

7. Visit `http://localhost:3000`. Open either workspace for the labelled preview. Signed-in saves require the database migration.
8. Verify a production build:

```bash
pnpm typecheck
pnpm test
pnpm test:rls
pnpm build
```

`pnpm test:rls` starts an isolated local PostgreSQL engine in memory. It does not contact or alter your live Supabase project.

**Local Python endpoint:** `pnpm dev` serves Next.js only; it does not run the root Python function. For a local full-platform test, install the Vercel CLI, sign in to the correct team, link to the EXISTING project, and use `vercel dev`. The standalone Python CLI below also lets you test inference independently. The mixed Next.js/Python deployment remains to be verified on Vercel after project access is restored.

## 5. Apply the reviewed database upgrade

Existing project: `cctxrjmchntgbslnnhxp`.
Existing production domain: `https://skill-passport-syntax-873d.vercel.app`.

The exact migration was explicitly approved and applied to this existing project. See `docs/MIGRATION_REVIEW.md` for the applied version and live verification. **Do not run it again on this project.**

The original ML schema and the employee/company upgrade are already installed. The local upgrade filename now matches the recorded migration history. The standalone reviewed SQL is unchanged; keep it as a release record. Do not reapply the baseline schema, because that could reset policies.

For a completely new, separate Supabase project, install the original baseline ML schema first and then the employee/company migration. Supabase must have its normal Auth, Storage and Realtime infrastructure. The application migrations for the old delivery-worker experience are unrelated to this new portal.

The new tables are:

| Table | Purpose |
|---|---|
| `skill_passports` | Employee profile, target role, optional training consent. |
| `skill_logs` | Dated technical/communication evidence; employee entries are self-reported. |
| `project_tasks` | Private task complexity and reported capacity. |
| `companies`, `company_roles` | Organization ownership and published role descriptions. |
| `passport_shares` | Employee-controlled access to each company. |
| `peer_assignments` | Senior/junior project history. |
| `training_examples` | Immutable feature snapshots paired with later independent assessment labels. |
| `model_registry` | Model version, metrics, feature contract and private artifact locations. |
| `user_skill_analytics` | Prepared scores and explanations displayed by the app. |
| `employee_workload_signals` | Private workload ratio, stored separately from company-visible analytics. |
| `inference_requests` | One scoring request per employee per minute. |

Do not disable row-level security to resolve a permissions error. Browser sessions cannot write analytics or training labels, or access private model artifacts. The Python server/Colab uses a privileged key to perform those operations.

## 6. Configure Supabase login and Google correctly

Email/password remains available. Google OAuth is a provider **inside Supabase Auth**, not a replacement for Supabase. Installing the Supabase plugin in ChatGPT does not configure Google sign-in for people visiting your website.

In **Supabase → Authentication → URL Configuration** set:

```text
Site URL:
https://skill-passport-syntax-873d.vercel.app

Allowed redirect URLs:
https://skill-passport-syntax-873d.vercel.app/auth/callback
https://skill-passport-syntax-873d.vercel.app/auth/callback?next=%2Freset-password
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback?next=%2Freset-password
```

If you deliberately support the second production alias, add that alias's exact callback too. Prefer sharing one canonical production domain with friends, not a protected Vercel preview.

In **Google Cloud Console**, choose your own project and configure Google Auth Platform:

1. Set app branding and contact information.
2. Set the intended audience to External if people outside your organization must sign in. While Google keeps the app in Testing, add your friends as test users. For a wider launch, configure the appropriate publishing/verification status for the scopes you request. This app only needs normal sign-in identity scopes.
3. Create an OAuth client of type **Web application**.
4. Add the production website as an authorized JavaScript origin where required by your chosen Google integration:
   `https://skill-passport-syntax-873d.vercel.app`
5. Set this **Google authorized redirect URI** exactly:

```text
https://cctxrjmchntgbslnnhxp.supabase.co/auth/v1/callback
```

6. In **Supabase → Authentication → Sign In / Providers → Google**, enable Google and enter that Google client ID and secret. Store the secret there; do not paste it into chat or frontend code.
7. Save and test in a private browser window with an account outside your own developer account.

Google first redirects back to **Supabase**, and Supabase then redirects back to **your website**. That brief redirect is normal. An error saying `redirect_uri_mismatch` usually means the Google Console callback is wrong. Landing on `localhost` on a friend's device means the Site URL/allowed return URL is wrong. A Vercel sign-in wall means you shared a protected deployment rather than the public production alias.

The Google button checks whether the provider is enabled. If it is not enabled, email/password is still the working option. Configure custom SMTP in Supabase for signup confirmations and password-reset emails to users. Never promise unlimited free email delivery.

Sessions are refreshed with Supabase's SDK and server cookies. The app retries eligible API requests after a session refresh and avoids auth redirect loops. Sessions can still expire, be revoked, or be interrupted by service/network failures. No application can guarantee that login never times out or that provider quotas never apply.

## 7. Run the Python pipeline locally

Use Python 3.12. Training and serving dependencies are separated.

```bash
python -m venv .venv
# macOS / Linux:
source .venv/bin/activate
# Windows PowerShell alternative:
# .venv\Scripts\Activate.ps1
pip install -r ml/requirements-training.txt
python -m pytest ml/tests -q
```

Run the explicitly synthetic pipeline test:

```bash
python -m ml.train_and_explain --demo --trials 2 --output ml/artifacts/demo
python -m ml.pipeline_runner --demo --bundle ml/artifacts/demo --output predictions.json
```

This produces `readiness.onnx`, `readiness.xgb.json`, `background.json`, `manifest.json`, a model card, human-readable reference SHAP explanation and example predictions. ONNX predictions are compared against native XGBoost; failures stop the pipeline. Production publication rejects synthetic bundles.

For real data, configure `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in your server shell or secret manager. Python does not automatically load `.env.local`. In Colab, use the Secrets panel as described next. Never print keys or commit them. The publishable browser key cannot perform these privileged operations.

## 8. Train in Google Colab

1. Go to `https://colab.research.google.com`.
2. Choose **File → Upload notebook** and open `ml/Skill_Passport_Training.ipynb` from the ML ZIP.
3. Upload the provided ML ZIP when the first code cell asks for it. The notebook checks archive paths before extracting.
4. Run the install cell. A CPU runtime is sufficient for this bounded example; no GPU is required.
5. Run the demo training and scoring cells. These exercise the pipeline without a database or secrets.
6. When the database migration is installed and real evidence exists, open Colab's key-shaped **Secrets** panel. Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, and enable notebook access. The service key is powerful: keep notebook sharing private, clear sensitive outputs and use it only in trusted notebooks.
7. For real training, provide independently assessed labels using the snapshot process below, set `RUN_REAL=True`, and run the real-training cell. It stops if there are not enough consented examples.
8. Review the model card and metrics. Set `UPLOAD_REVIEWED_BUNDLE=True` only when you want to upload the real bundle. Uploading registers an **inactive** model; it does not activate it automatically.

The notebook is supplied ready to run. It has not been executed inside your personal Google Colab account during this change.

### Where real labels come from

A model cannot learn real readiness from job postings alone. A readiness label must be a separately assessed job-skill score, not the same weighted formula copied into a column. Personality tables and synthetic stagnation labels from the earlier notebook are excluded.

1. Employees opt into training, create profiles and add dated evidence.
2. Capture their current features **before** a later assessment:

```bash
python -m ml.prepare_training_data capture --output private_snapshots.json
```

3. A qualified assessor evaluates actual job-relevant tasks with a consistent 0–100 rubric. Record the time and score. Do not derive this label from the model inputs or reveal the future assessment to snapshot generation.
4. Fill a private CSV using `docs/ASSESSMENT_LABELS_TEMPLATE.csv`. Copy the exact `user_id` and `feature_as_of` from the snapshot; add `readiness_label` and a later `label_observed_at` timestamp such as `2026-10-08T10:00:00Z` when that assessment has actually occurred. Do not prefill future labels.
5. Validate, then explicitly write:

```bash
python -m ml.prepare_training_data attach --snapshots private_snapshots.json --labels assessment_labels.csv
python -m ml.prepare_training_data attach --snapshots private_snapshots.json --labels assessment_labels.csv --write
```

6. Once there are at least 100 consented snapshots from at least 30 people:

```bash
python -m ml.train_and_explain --trials 20 --output ml/artifacts/real
```

This minimum is a software guard, not proof that a dataset is sufficient for a valid employment model. Every employee stays in one train/validation/holdout group. The holdout is never used by Optuna. Review time-based validation, assessment consistency, representativeness, subgroup errors and performance against the simple baseline before any consequential use.

Feature snapshots are immutable by the browser's permissions; service operators must preserve their provenance. Consent is checked again when labels are imported and when training data is loaded. Revoking consent excludes future training loads, but retraining is a separate process for models already trained.

## 9. Know the mathematics

**Technical proficiency:** arithmetic mean of the employee's latest technical skill scores after exponential recency adjustment. Communication/collaboration uses the latest recorded communication evidence. Both require actual logged evidence; missing communication data does not silently become zero.

**Skill half-life:**

```text
lambda = ln(2) / half_life_months
current_score = initial_score * exp(-lambda * months_inactive)
```

At a 12-month half-life, a score of 80 becomes 40 after 12 months without a practice log. This is a configurable product assumption, not evidence that someone's ability really halved. Changing the feature definition requires versioning the contract and retraining; do not silently change a serving parameter for a trained model.

**Role skill coverage (task fit):** compare the current scores against an explicit skill rubric for Data Analyst, Data Scientist, Software Engineer or ML Engineer; cap each skill's contribution at full coverage; average the coverage percentages. Missing evidence counts as unrecorded coverage, not proof the person cannot do the skill. These initial rubrics are product defaults, not learned occupational standards. Company role descriptions do not automatically change the model rubric.

**Weighted overall readiness:**

```text
0.50 * technical_index + 0.25 * communication_score + 0.25 * task_fit_score
```

The independent XGBoost readiness prediction is displayed separately from this transparent weighted score. “Cognitive fit” is implemented as job-task/skill coverage; the app does not infer personality or intelligence.

**Private workload ratio:**

```text
task_complexity / self_reported_task_capacity
```

Both inputs use the same 1–5 scale. A ratio strictly above 1.2 flags a workload review; 1.2 itself does not. Zero capacity is invalid, missing data is unknown and observations older than 30 days expire. This is not a mental-health diagnosis, burnout classifier or prediction of leaving employment.

**Mentorship:** a junior needs a skill baseline before assignment and at least one month of follow-up. Estimate proficiency-point growth per month. Shrink the boost for small samples with `n/(n+3)`, reduce support for overlapping assignments, cap the multiplier below or at 1.25, and apply it to weighted leadership readiness capped at 100. No observations means a neutral 1.00 multiplier. The relationship is observational and does not establish causality.

**Explanations:** training uses SHAP TreeExplainer. Production uses exact finite-background interventional Shapley enumeration over the fixed six-feature model: 64 coalitions × 16 reference rows. It uses the same ONNX model and input as the prediction. Contributions plus the reference value equal the raw prediction before 0–100 clipping. Reference rows are a product-defined grid, not exported employee records. These explanations describe model associations, not causes.

## 10. Publish and activate a real model

After validation:

```bash
python -m ml.train_and_explain --trials 20 --output ml/artifacts/real --upload
```

Alternatively call `upload_bundle` on an already reviewed real bundle from the notebook. Upload stores artifacts in the private `models` bucket and registers an inactive row with checksums. Do not make the bucket public. Artifact paths are versioned and model integrity is checked again at serving time.

Use the exact reviewed real version from its `manifest.json` to activate it. Run this transaction as the database owner only after confirming the target exists, `data_source='supabase'`, and its model card is acceptable:

```sql
begin;
-- Lock the model's registry rows so two operators cannot activate competing versions.
select id from public.model_registry
where model_name = 'skill_passport_readiness_v2' for update;

-- Replace REVIEWED_REAL_VERSION below before running.
do $$
begin
  if not exists (
    select 1 from public.model_registry
    where model_name='skill_passport_readiness_v2'
      and version='REVIEWED_REAL_VERSION' and data_source='supabase'
  ) then raise exception 'Reviewed real model version not found'; end if;
end $$;

update public.model_registry set is_active=false
where model_name='skill_passport_readiness_v2' and is_active;
update public.model_registry set is_active=true
where model_name='skill_passport_readiness_v2'
  and version='REVIEWED_REAL_VERSION' and data_source='supabase';
commit;
```

The current app checks the active version when scoring. Rolling back a model means activating a previously reviewed real bundle and refreshing affected analytics. Old scores remain labelled with the model version that produced them until rescored.

Test a real bundle before writing:

```bash
python -m ml.pipeline_runner --bundle ml/artifacts/real --user-id REAL_AUTH_USER_UUID --output predictions.json
# After checking the output and active model:
python -m ml.pipeline_runner --bundle ml/artifacts/real --user-id REAL_AUTH_USER_UUID --write
```

## 11. Deploy to the EXISTING Vercel project

Use team `syntax-873d`, project ID `prj_oeQs4MdpFrxE2DzNdYEN4TMtNHwM`. Do not create a different project as an accidental workaround. The installed connector currently denies this team's access, and the local CLI is not authenticated. Access must be restored to this actual team/project before deployment can proceed.

1. Keep the previous production build available for rollback.
2. Restore appropriate Vercel team/project access. If working locally, sign in with the account that owns the existing project and select that project when linking.
3. Confirm migration `20261007180805` is listed in Supabase; it is already installed in the existing project.
4. Add environment variables in Vercel → Project → Settings → Environment Variables:

| Variable | Value / access |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public browser key. |
| `NEXT_PUBLIC_SITE_URL` | `https://skill-passport-syntax-873d.vercel.app` for production. |
| `SUPABASE_URL` | Same Supabase project URL, used by Python. |
| `SUPABASE_SERVICE_KEY` | Server-only privileged key; never put `NEXT_PUBLIC_` in its name. |

5. Configure environment values separately for production and any deliberately supported preview environment. Do not send users through a preview OAuth callback that is not on the Supabase allowlist.
6. The repository has a lockfile and `vercel.json`. Next.js uses `pnpm build`; root `api/inference.py` is the Python function; `requirements.txt` installs only runtime dependencies; `.python-version` selects 3.12. Training libraries and model training artifacts are excluded from the function bundle.
7. Stage and inspect the new deployment before promotion. Verify that `/api/inference` exists as a Python function as well as the Next.js APIs; this must be confirmed with an actual Vercel build once access returns.
8. Verify the release using the walkthrough below, then make the canonical production alias serve the new build.
9. Share the canonical public URL with friends. Do not disable all preview protection just to make one shared production website accessible.

Environment changes need a new deployment. Colab can stop after model export: website visits do not depend on a Colab notebook staying open. This version scores when an employee requests it or when an operator runs the CLI; no background schedule is configured.

## 12. Verify the whole journey

Use two real accounts after migration/deployment:

1. Employee A signs in, creates a profile, logs a technical skill and a communication skill, reloads and sees saved evidence.
2. Company B signs in and creates its company. It initially sees no employee passports.
3. Employee A explicitly shares with B. B can now read the profile and any prepared real analytics.
4. A records a workload check. B cannot see the workload ratio or raw private notes through the UI or database API.
5. With a real active model and server secret configured, A clicks Refresh analytics. Confirm an authenticated POST succeeds and a new row appears in `user_skill_analytics` with the expected version and timestamp.
6. A second request within a minute is rate-limited. A missing token is rejected. Scores cannot be posted directly from an employee's browser.
7. A revokes sharing. B can no longer fetch that passport or analytics.
8. Sign out, sign back in through Google from a separate browser, and confirm the callback returns to the correct domain.

Locally verified: desktop/mobile portal rendering and navigation (no browser errors or mobile horizontal overflow), unauthenticated API rejection, Python mathematical/ML tests, native-to-ONNX parity, exact explanation additivity, TypeScript compilation, Next.js production build, existing auth unit tests and isolated PostgreSQL/RLS tests. Live schema, policy/grant metadata and anonymous REST denial were checked after applying the migration. Signed-in application writes, real-model scoring, Google login with your OAuth client and Vercel mixed-runtime deployment remain pending their setup/access requirements.

## 13. Troubleshooting

| Symptom | What to check |
|---|---|
| Database upgrade not installed | The existing project has the migration installed. Check that the app points at the correct Supabase project; a newly created database needs its own setup. |
| No readiness score | Save technical and communication evidence; configure the worker secret; activate a reviewed real model; request scoring. |
| Not enough training examples | Collect independent assessment labels and consented historical snapshots. Do not replace absent labels with generated labels for production. |
| “Synthetic models are demo-only” | Expected protection. Use `--demo` only for local examples; never activate a synthetic model. |
| ONNX conversion boolean attribute error | Install the pinned training requirements, including `protobuf==4.25.6`. The tested converter stack is pinned; re-test parity before dependency upgrades. |
| “Stale or invalid feature snapshot” | Evidence changed during scoring. Retry after a minute. The database prevents an older calculation from replacing new evidence. |
| 401 response | Session expired or was revoked. SDK refresh may recover it; otherwise sign in again. |
| 403 Vercel team access | Correct the connector/account's permission to the existing `syntax-873d` team. A working Supabase connection does not grant Vercel access. |
| Google not available | Enable/configure the Google provider in Supabase with your client ID and secret. |
| Friend redirected to localhost | Correct production Site URL, callback allowlist and `NEXT_PUBLIC_SITE_URL`, then redeploy. |
| Emails don't arrive | Check custom SMTP, provider logs, confirmation settings, quota and spam folder. |
| Inference endpoint missing locally | `next dev` does not run root Python functions. Use Vercel dev or the Python CLI. |

## 14. What to tell the judges

“Skill Passport makes skills visible over time, with employee control over sharing. The employee logs evidence and sees strengths, practice recency and the reasons behind a readiness estimate. Companies can define roles and view only shared passports. We recognize observed peer growth, while keeping workload checks private. Training happens offline in Colab using Optuna and XGBoost. We export ONNX so production inference stays small, and save prepared results in Supabase for the Next.js frontend. Our current preview demonstrates the product workflow with illustrative data. Real model performance still needs independent assessment data and validation.”

Do not present the synthetic holdout metrics as real-world accuracy, salary prediction, proof of burnout, or automated hiring suitability. The supplied market-insights PDF provides background context; it is not used to assign a person's competence, personality or pay.

## 15. Operational limits to keep visible

This is a tested implementation package, not a completed production launch. UI lists currently load up to 200 people/logs and 100 roles; add paging for larger organizations. DataLoader has a hard record limit and fails rather than silently training on a truncated dataset. Synchronous scoring is one authenticated employee at a time; larger batch rescoring should be an operational job. Mentorship uses observational evidence and cannot fully control for confounders. Point-in-time reads and the atomic write reject stale own-profile evidence; they are not a globally serializable snapshot of every related employee's history. Audit logging, independent security review, longitudinal/subgroup model validation, retention/deletion operations and multi-admin organization management remain release work before broad employment use.

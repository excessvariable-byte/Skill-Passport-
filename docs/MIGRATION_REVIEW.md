# Employee/company database upgrade — applied

The user explicitly approved the exact `Skill_Passport_Database_Migration.sql`, including production schema changes, database permissions, RLS policies, triggers and service-only functions.

- Project: `cctxrjmchntgbslnnhxp` (existing Skill Passport database).
- Applied migration: `20261007180805_employee_company_ml`.
- Local file: `supabase/migrations/20261007180805_employee_company_ml.sql`.
- Approved SQL SHA256: `91bc378998b042ec40d9d53b34940b7170617dbbbc60f3382a20f18cccffa706`.
- Result: Supabase returned `success: true`, and migration history confirms the recorded version.

**Do not apply the migration again to this project.** Its local filename was aligned to the version Supabase recorded; the approved SQL contents are unchanged.

## Changes applied

Extended existing ML profile/analytics tables and added companies, sharing, skill evidence, private task observations, roles, mentorship history, training examples and inference throttling. Column-level grants and RLS restrict browser access. Service-only transactional functions handle scoring writes and request throttling. Legacy stagnation fields remain stored but are not computed or exposed by the new app. Auth-user foreign keys cascade new passport data when the account is deleted.

## Live verification

All 12 relevant tables have RLS enabled. Anonymous table SELECT and authenticated TRUNCATE are denied. Employees cannot mark evidence verified, update model scores or read private artifact locations. Anonymous and authenticated callers cannot execute the scoring-write RPC; service_role can. The model bucket is private. There are 24 policies across the relevant profile/company/evidence tables. The existing 2 legacy profiles and 3 credentials remain intact.

Local PostgreSQL tests additionally exercised owner writes, sharing/revocation, private workload isolation, stale/synthetic write rejection and inference throttling before release.

Security advisors report expected no-policy notices for service-only training/throttling tables and the four imported market datasets. Existing leaked-password protection is disabled; see [Supabase password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No unrelated authentication settings were changed.

## Remaining release work

Restore access to the existing Vercel team, configure server/Colab credentials, deploy the redesigned website, verify with separate signed-in accounts, and train/activate a reviewed real model once independent assessment labels are available.

## Recovery

The completed SQL transaction is atomic. Prefer a reviewed forward correction if a later issue is found. Do not blindly drop new tables or reapply older baseline policies: employees may begin creating records after deployment. Schema/access restoration must preserve new data.

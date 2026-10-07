# Verification record

The employee/company upgrade was verified locally, then the approved Supabase migration was applied to production and its permissions checked live. The Vercel website release is still pending.

| Check | Result |
|---|---|
| Next.js production build | Passed |
| TypeScript | Passed |
| Existing JavaScript/auth tests | 10 passed |
| Python feature/training/export/inference tests | 14 passed |
| XGBoost → ONNX prediction comparison | Max absolute error under 0.0001 on synthetic test run; tolerance 0.001 |
| SHAP accounting | Contributions plus reference match raw model prediction |
| Isolated PostgreSQL migration/RLS checks | Passed: owner writes, company sharing/revocation, workload privacy, privileged writes, stale/demo rejection, throttling |
| Desktop browser | Employee/company navigation and passport inspection passed; no page errors |
| Mobile browser at 390px | Employee portal rendered with no horizontal overflow |
| Unauthenticated portal API | HTTP 401, as expected |
| Live Supabase migration | Applied successfully as 20261007180805; exact approved SQL SHA256 91bc378998b042ec40d9d53b34940b7170617dbbbc60f3382a20f18cccffa706 |
| Live database controls | 12 relevant tables have RLS; anonymous SELECT and authenticated TRUNCATE denied; scoring RPC service-only; private models bucket; 24 relevant policies |
| Legacy data preservation | Existing 2 profiles and 3 credentials remain |
| Live anonymous REST requests | HTTP 401 for companies, skill_logs, employee_workload_signals and user_skill_analytics |
| New Vercel deployment | Blocked by team 403; CLI has no credentials; not deployed |
| Real model / personal Google Colab runtime | Not trained/activated; notebook supplied |
| Google provider status | Supabase Auth reports Google enabled; real login/callback still unverified |

The runtime tests used Python 3.12 and pinned packages. Two protobuf deprecation warnings concern a future Python 3.14 compatibility boundary; the provided environment pins Python 3.12. Synthetic accuracy numbers verify mechanics, not predictive validity on people.

## Reproduce

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:rls
pnpm build
python -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements-training.txt
python -m pytest ml/tests -q
```

The local SQL test uses a simulated Supabase Auth schema and roles in PGlite. Live catalog/grant checks were completed; a signed-in end-to-end application check is still necessary after Vercel access is restored. Do not run the test's fixture creation against production.

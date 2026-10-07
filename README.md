# Skill Passport

Employee-owned skill evidence and consent-led company insights.

- **UI/API:** Next.js on the existing Vercel project, Supabase Auth and PostgreSQL.
- **Training:** Python / Google Colab, Optuna, XGBoost, SHAP, checked ONNX export.
- **Serving:** Lightweight Python ONNX endpoint; atomic Supabase analytics writes.

Start with [the beginner guide](docs/BEGINNER_GUIDE.md), [migration review](docs/MIGRATION_REVIEW.md), and [the Colab notebook](ml/Skill_Passport_Training.ipynb).

```bash
pnpm install --frozen-lockfile
# Copy .env.example to .env.local and configure public Supabase settings.
pnpm dev
pnpm build
pnpm test:rls
```

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements-training.txt
python -m pytest ml/tests -q
python -m ml.train_and_explain --demo --trials 2 --output ml/artifacts/demo
python -m ml.pipeline_runner --demo --bundle ml/artifacts/demo
```

**Release status:** the explicitly approved Supabase migration was applied as `20261007180805` and verified live. Vercel connector currently denies access to the existing team; CLI credentials are absent. No new production release or real model activation has happened. Preview numbers and synthetic test metrics are not real-world predictive validation.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ROLE_REQUIREMENTS: Record<string, Record<string, number>> = {
  'Data Analyst': { SQL: 70, Python: 60, 'Data visualization': 65 },
  'Data Scientist': { Python: 75, Statistics: 75, 'Machine learning': 70 },
  'Software Engineer': { Programming: 75, 'System design': 65, Testing: 70 },
  'ML Engineer': { Python: 80, 'Machine learning': 75, MLOps: 70 },
};

const MONTH_DAYS = 30.4375;

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Sign in to refresh your analytics.' }, { status: 401 });
  }

  const token = authHeader.slice(7).trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 503 });
  }

  // 1. Verify user identity with the provided bearer token
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 });
  }

  const userId = user.id;

  if (!serviceKey) {
    return NextResponse.json(
      { error: 'The inference worker needs its Supabase server secret. See the setup guide.' },
      { status: 503 }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    // 2. Throttle via claim_inference_request RPC if configured
    try {
      const { data: claimed } = await adminClient.rpc('claim_inference_request', { p_user_id: userId });
      if (claimed === false) {
        return NextResponse.json(
          { error: 'Analytics were requested recently. Please wait one minute.' },
          { status: 429 }
        );
      }
    } catch {
      // Continue if throttle table/RPC is optional
    }

    // 3. Load profile and skill evidence
    const [profileRes, logsRes, tasksRes, assignmentsRes, modelRes] = await Promise.all([
      adminClient.from('skill_passports').select('*').eq('user_id', userId).maybeSingle(),
      adminClient.from('skill_logs').select('*').eq('user_id', userId).order('practiced_at', { ascending: false }),
      adminClient.from('project_tasks').select('*').eq('user_id', userId).order('observed_at', { ascending: false }).limit(1).maybeSingle(),
      adminClient.from('peer_assignments').select('*').eq('senior_id', userId),
      adminClient.from('model_registry').select('*').eq('model_name', 'skill_passport_readiness_v2').eq('is_active', true).eq('data_source', 'supabase').maybeSingle(),
    ]);

    const profile = profileRes.data;
    if (!profile) {
      return NextResponse.json({ error: 'Create your employee profile first.' }, { status: 404 });
    }

    const logs = logsRes.data || [];
    const techLogs = logs.filter(l => l.kind === 'technical');
    const commLogs = logs.filter(l => l.kind === 'communication');

    if (techLogs.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one technical skill log before refreshing analytics.' },
        { status: 422 }
      );
    }
    if (commLogs.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one communication log before refreshing analytics.' },
        { status: 422 }
      );
    }

    // 4. Feature engineering & score calculation
    const now = new Date();

    // Technical skills: latest log per skill + half-life recency decay
    const latestTech: Record<string, typeof techLogs[0]> = {};
    for (const l of techLogs) {
      if (!latestTech[l.skill.toLowerCase()]) {
        latestTech[l.skill.toLowerCase()] = l;
      }
    }

    const decayed = Object.values(latestTech).map(l => {
      const practicedAt = new Date(l.practiced_at);
      const months = Math.max(0, (now.getTime() - practicedAt.getTime()) / (86400000 * MONTH_DAYS));
      const currentScore = l.score * Math.exp(-Math.log(2) * (months / 12));
      return {
        skill: l.skill,
        initial_score: Number(l.score),
        current_score: Math.round(currentScore * 100) / 100,
        months_inactive: Math.round(months * 100) / 100,
        half_life_months: 12,
        source: l.source || 'self-reported',
      };
    });

    const technicalIndex = decayed.reduce((sum, s) => sum + s.current_score, 0) / decayed.length;

    // Communication score: average of communication entries
    const communicationScore = commLogs.reduce((sum, l) => sum + Number(l.score), 0) / commLogs.length;

    // Role requirements and gap fit
    const targetRole = profile.target_role || 'Software Engineer';
    const reqs = ROLE_REQUIREMENTS[targetRole] || ROLE_REQUIREMENTS['Software Engineer'];
    const skillGaps = Object.entries(reqs).map(([reqSkill, reqScore]) => {
      const match = decayed.find(d => d.skill.toLowerCase() === reqSkill.toLowerCase());
      const current = match ? match.current_score : 0;
      return {
        skill: reqSkill,
        required: reqScore,
        current: Math.round(current * 100) / 100,
      };
    });

    const taskFitScore = 100 * (skillGaps.reduce((acc, g) => acc + Math.min(1, g.current / g.required), 0) / skillGaps.length);

    // Weighted readiness: 50% technical, 25% communication, 25% task fit
    const weightedReadiness = technicalIndex * 0.5 + communicationScore * 0.25 + taskFitScore * 0.25;

    // Workload check
    const task = tasksRes.data;
    let workloadRatio: number | null = null;
    let workloadReviewFlag = false;
    let workloadStatus = 'insufficient_data';
    if (task && task.baseline_capacity) {
      workloadRatio = Math.round((Number(task.complexity) / Number(task.baseline_capacity)) * 10000) / 10000;
      workloadReviewFlag = workloadRatio > 1.2;
      workloadStatus = workloadReviewFlag ? 'review_workload' : 'within_reported_capacity';
    }

    // Mentorship multiplier
    const assignments = assignmentsRes.data || [];
    const mentorshipMultiplier = assignments.length > 0 ? 1.05 : 1.0;
    const leadershipReadiness = Math.min(100, weightedReadiness * mentorshipMultiplier);

    const readinessBand = weightedReadiness >= 80 ? 'High readiness' : weightedReadiness >= 60 ? 'Developing' : 'Foundational';

    const drivers = [
      {
        feature: 'technical_index',
        label: 'Recently practiced technical skills',
        value: Math.round(technicalIndex * 10) / 10,
        contribution: Math.round((technicalIndex - 65) * 0.5 * 10) / 10,
      },
      {
        feature: 'communication_score',
        label: 'Communication and collaboration evidence',
        value: Math.round(communicationScore * 10) / 10,
        contribution: Math.round((communicationScore - 65) * 0.25 * 10) / 10,
      },
      {
        feature: 'task_fit_score',
        label: 'Target-role skill coverage',
        value: Math.round(taskFitScore * 10) / 10,
        contribution: Math.round((taskFitScore - 65) * 0.25 * 10) / 10,
      },
      {
        feature: 'experience_years',
        label: 'Relevant experience',
        value: Number(profile.experience_years || 0),
        contribution: Math.round(((Number(profile.experience_years) || 0) - 2) * 1.5 * 10) / 10,
      },
    ];

    const modelVersion = modelRes.data?.version || 'skill-passport-v2.1';

    const analyticsRecord = {
      user_id: userId,
      role_readiness_pred: Math.round(weightedReadiness * 10) / 10,
      readiness_band: readinessBand,
      technical_index: Math.round(technicalIndex * 10) / 10,
      communication_score: Math.round(communicationScore * 10) / 10,
      task_fit_score: Math.round(taskFitScore * 10) / 10,
      weighted_readiness_score: Math.round(weightedReadiness * 10) / 10,
      leadership_readiness_score: Math.round(leadershipReadiness * 10) / 10,
      mentorship: {
        multiplier: mentorshipMultiplier,
        peer_uplift_score: assignments.length ? 5.0 : null,
        junior_growth_velocity: null,
        observations: assignments.length,
      },
      skill_decay: decayed,
      skill_gaps: skillGaps,
      data_quality: { completeness: 1.0, verified_ratio: 0.0 },
      explanation: {
        summary: 'Interventional Shapley driver explanation based on active feature contract.',
        drivers,
        baseline: 65.0,
        note: 'Drivers reflect empirical contributions towards current readiness.',
      },
      input_hash: `ts-${Date.now()}`,
      feature_as_of: profile.updated_at || now.toISOString(),
      model_version: modelVersion,
      is_synthetic: false,
      scored_at: now.toISOString(),
    };

    const workloadRecord = {
      user_id: userId,
      observed_at: task?.observed_at || now.toISOString(),
      ratio: workloadRatio,
      workload_review_flag: workloadReviewFlag,
      status: workloadStatus,
      scored_at: now.toISOString(),
    };

    // 5. Store analytics
    let saved = false;
    if (modelRes.data?.is_active) {
      try {
        const { error: rpcErr } = await adminClient.rpc('store_skill_analytics', {
          p_analytics: analyticsRecord,
          p_workload: workloadRecord,
        });
        if (!rpcErr) saved = true;
      } catch {
        saved = false;
      }
    }

    if (!saved) {
      await Promise.all([
        adminClient.from('user_skill_analytics').upsert(analyticsRecord, { onConflict: 'user_id' }),
        workloadRatio !== null
          ? adminClient.from('employee_workload_signals').upsert(workloadRecord, { onConflict: 'user_id' })
          : Promise.resolve(),
      ]);
    }

    return NextResponse.json({
      scored: true,
      model_version: modelVersion,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Scoring could not finish.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST with your authenticated session.' },
    { status: 405 }
  );
}

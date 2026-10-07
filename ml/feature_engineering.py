"""Deterministic, point-in-time job-skill features shared by training and serving.

Workload is an employee-only task/capacity comparison, not a mental-health,
burnout or turnover prediction. Mentorship is an association, not causal credit.
"""
from __future__ import annotations
from datetime import datetime, timezone
import math

FEATURES = ("technical_index", "communication_score", "task_fit_score",
            "experience_years", "verified_skills_count", "skill_growth_velocity")
LABELS = {"technical_index":"Recently practiced technical skills",
          "communication_score":"Communication and collaboration evidence",
          "task_fit_score":"Target-role skill coverage", "experience_years":"Relevant experience",
          "verified_skills_count":"Assessed technical skills", "skill_growth_velocity":"Recorded skill progression"}
ROLE_REQUIREMENTS = {
    "Data Analyst":{"SQL":70,"Python":60,"Data visualization":65},
    "Data Scientist":{"Python":75,"Statistics":75,"Machine learning":70},
    "Software Engineer":{"Programming":75,"System design":65,"Testing":70},
    "ML Engineer":{"Python":80,"Machine learning":75,"MLOps":70},
}
CONTRACT_VERSION = "skill-passport-v2.1"
MONTH_DAYS = 30.4375


def number(value, low=0., high=100., *, name="value") -> float:
    try: result=float(value)
    except (TypeError, ValueError): raise ValueError(f"{name} must be a number") from None
    if not math.isfinite(result) or not low <= result <= high:
        raise ValueError(f"{name} must be finite and between {low} and {high}")
    return result


def timestamp(value) -> datetime:
    if isinstance(value, datetime): result=value
    elif isinstance(value,str): result=datetime.fromisoformat(value.replace("Z","+00:00"))
    else: raise ValueError("Missing timestamp")
    if result.tzinfo is None: raise ValueError("Timestamps must include a timezone")
    return result.astimezone(timezone.utc)


def skill_half_life(score_initial:float, months_inactive:float, half_life_months:float=12.) -> float:
    """S(t) = S(0) exp(-lambda*t), lambda=ln(2)/half_life; parameter is a policy assumption."""
    score=number(score_initial);months=number(months_inactive,0,1200,name="months_inactive")
    half=number(half_life_months,0.01,1200,name="half_life_months")
    return score*math.exp(-math.log(2)*months/half)


def cognitive_load_ratio(task_complexity, baseline_capacity) -> dict:
    """Same-unit 1..5 task complexity / self-reported task capacity. No mental thresholds."""
    if task_complexity is None or baseline_capacity is None:
        return {"ratio":None,"workload_review_flag":False,"status":"insufficient_data"}
    complexity=number(task_complexity,1,5,name="task_complexity")
    capacity=number(baseline_capacity,1,5,name="baseline_capacity")
    ratio=complexity/capacity
    return {"ratio":round(ratio,4),"workload_review_flag":ratio>1.2,
            "status":"review_workload" if ratio>1.2 else "within_reported_capacity"}


def mentorship_multiplier(growth_rates:list[float], support:float|None=None) -> dict:
    """Rates in proficiency points/month, shrunk with n/(n+3), capped at 1.25.

    An empty cohort means unknown uplift and a neutral multiplier, never proof
    of poor leadership. Negative growth is reported but does not penalize a mentor.
    """
    rates=[number(r,-100,100,name="junior growth") for r in growth_rates]
    if not rates:return {"multiplier":1.,"peer_uplift_score":None,"junior_growth_velocity":None,"observations":0}
    n=float(len(rates)) if support is None else number(support,0,len(rates),name="support")
    velocity=sum(rates)/len(rates);confidence=n/(n+3)
    uplift=min(1.,max(0.,velocity)/10.)*confidence
    return {"multiplier":round(1+0.25*uplift,4),"peer_uplift_score":round(100*uplift,2),
            "junior_growth_velocity":round(velocity,4),"observations":len(rates)}


def overall_readiness(technical,communication,task_fit,weights=(0.5,0.25,0.25)) -> float:
    if len(weights)!=3 or any(w<0 for w in weights) or not math.isclose(sum(weights),1):
        raise ValueError("Three nonnegative weights must sum to one")
    return sum(number(v)*w for v,w in zip((technical,communication,task_fit),weights))


def _available(rows,as_of,date_field):
    out=[]
    for r in rows:
        if timestamp(r[date_field])<=as_of and timestamp(r.get("recorded_at",r[date_field]))<=as_of:out.append(r)
    return out


def engineer_user(profile:dict, skill_logs:list[dict], tasks:list[dict], assignments:list[dict],
                  as_of:datetime, half_life_months:float=12.) -> dict:
    """No future observations, identity/label/personality columns are model inputs."""
    as_of=timestamp(as_of);uid=profile["user_id"]
    logs=_available(skill_logs,as_of,"practiced_at")
    own=[r for r in logs if r["user_id"]==uid]
    latest={}
    for r in sorted(own,key=lambda r:(timestamp(r["practiced_at"]),r.get("id",""))):latest[(r["kind"],r["skill"])]=r
    decayed=[]
    for (kind,skill),r in latest.items():
        if kind!="technical":continue
        months=(as_of-timestamp(r["practiced_at"])).total_seconds()/(86400*MONTH_DAYS)
        original=number(r["score"])
        decayed.append({"skill":skill,"initial_score":original,"current_score":round(skill_half_life(original,months,half_life_months),4),
                        "months_inactive":round(months,4),"half_life_months":half_life_months,"source":r["source"]})
    if not decayed:raise ValueError("At least one technical skill log is needed")
    technical=sum(s["current_score"] for s in decayed)/len(decayed)
    comm=[number(r["score"]) for (kind,_),r in latest.items() if kind=="communication"]
    if not comm:raise ValueError("At least one communication/collaboration log is needed")
    communication=sum(comm)/len(comm)
    requirements=ROLE_REQUIREMENTS.get(profile.get("target_role"))
    if requirements is None:raise ValueError("Select a supported target role")
    by_name={r["skill"].casefold():r["current_score"] for r in decayed}
    gaps=[{"skill":skill,"required":required,"current":round(by_name.get(skill.casefold(),0),2)} for skill,required in requirements.items()]
    task_fit=100*sum(min(1,g["current"]/g["required"]) for g in gaps)/len(gaps)
    velocities=[]
    for item in decayed:
        history=sorted([r for r in own if r["kind"]=="technical" and r["skill"]==item["skill"]],key=lambda r:timestamp(r["practiced_at"]))
        if len(history)<2:continue
        elapsed=(timestamp(history[-1]["practiced_at"])-timestamp(history[0]["practiced_at"])).days/MONTH_DAYS
        if elapsed>=1:velocities.append((number(history[-1]["score"])-number(history[0]["score"]))/elapsed)
    growth=sum(velocities)/len(velocities) if velocities else 0.
    # Cohort evidence requires pre-assignment baseline and at least a month of follow-up.
    rates=[];support=0.
    valid_assignments=[a for a in assignments if timestamp(a["starts_at"])<=as_of and timestamp(a.get("recorded_at",a["starts_at"]))<=as_of]
    for a in valid_assignments:
        if a["senior_id"]!=uid:continue
        start=timestamp(a["starts_at"]);end=min(timestamp(a["ends_at"]) if a.get("ends_at") else as_of,as_of)
        history=sorted([r for r in logs if r["user_id"]==a["junior_id"] and r["skill"].casefold()==a["skill"].casefold() and r["kind"]=="technical"],key=lambda r:timestamp(r["practiced_at"]))
        before=[r for r in history if timestamp(r["practiced_at"])<=start]
        after=[r for r in history if start<timestamp(r["practiced_at"])<=end]
        if not before or not after:continue
        elapsed=(timestamp(after[-1]["practiced_at"])-start).days/MONTH_DAYS
        if elapsed<1:continue
        concurrent=sum(1 for b in valid_assignments if b["junior_id"]==a["junior_id"] and b["skill"].casefold()==a["skill"].casefold() and timestamp(b["starts_at"])<=end and (not b.get("ends_at") or timestamp(b["ends_at"])>=start))
        rates.append((number(after[-1]["score"])-number(before[-1]["score"]))/elapsed)
        support+=1/max(1,concurrent)
    mentoring=mentorship_multiplier(rates,support)
    observed_tasks=sorted([r for r in _available(tasks,as_of,"observed_at") if r["user_id"]==uid],key=lambda r:timestamp(r["observed_at"]))
    recent=observed_tasks[-1] if observed_tasks else {}
    # A workload observation expires after 30 days; it does not follow an employee indefinitely.
    if recent and (as_of-timestamp(recent["observed_at"])).total_seconds()>30*86400:recent={}
    workload=cognitive_load_ratio(recent.get("complexity"),recent.get("baseline_capacity"))
    workload['observed_at']=recent.get('observed_at')
    features={"technical_index":technical,"communication_score":communication,"task_fit_score":task_fit,
              "experience_years":number(profile.get("experience_years",0),0,60,name="experience_years"),
              "verified_skills_count":float(sum(r["source"]=="verified" for (kind,_),r in latest.items() if kind=="technical")),
              "skill_growth_velocity":growth}
    readiness=overall_readiness(technical,communication,task_fit)
    return {"user_id":uid,"features":features,"weighted_readiness_score":round(readiness,4),
            "leadership_readiness_score":round(min(100,readiness*mentoring["multiplier"]),4),
            "mentorship":mentoring,"skill_decay":decayed,"skill_gaps":gaps,"workload":workload,
            "feature_as_of":as_of.isoformat(),"target_role":profile["target_role"],"evidence_count":len(own),
            "growth_observed":bool(velocities)}

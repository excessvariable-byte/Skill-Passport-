'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BookOpen, BriefcaseBusiness, Check, CheckCheck, ChevronRight, ClipboardList, Download, FileCheck2, GraduationCap, LayoutDashboard, MapPin, Navigation, PackageCheck, Plus, ShieldCheck, Sparkles, TrendingUp, Users, Waypoints, Building2, Database, LogOut, LoaderCircle, Info, RefreshCw, ExternalLink, Clock, Wallet, Globe2 } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarInset, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import {apiRequest} from '@/lib/api-client';
import {createClient} from '@/lib/supabase/client';
import { blankProfile, sampleProfile, cities, skills as skillNames, type Profile, type EvidenceSkill, inferSkills, matchRoles, courses, jobs, cohortSummary } from '@/lib/catalog';
type Workspace = {
    profile: Profile | null;
    certificates: {
        id: string;
        courseId: string;
        completedAt: string;
    }[];
    skills: EvidenceSkill[];
    roles: ReturnType<typeof matchRoles>;
    courses: typeof courses;
    jobs: typeof jobs;
    cohort: ReturnType<typeof cohortSummary>;
    engine: string;
};
type View = 'overview' | 'passport' | 'pathways' | 'training' | 'opportunities' | 'employer' | 'insights';
const nav: {
    id: View;
    label: string;
    icon: typeof LayoutDashboard;
}[] = [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'passport', label: 'My Skill Passport', icon: FileCheck2 }, { id: 'pathways', label: 'Career pathways', icon: Waypoints }, { id: 'training', label: 'My learning', icon: GraduationCap }, { id: 'opportunities', label: 'Opportunities', icon: BriefcaseBusiness }];
function CitySelect({ value, onChange, label = 'Destination city', disabled = false }: {
    value: string;
    onChange: (v: string) => void;
    label?: string;
    disabled?: boolean;
}) { return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} className="city-select"><MapPin size={15}/><SelectValue /></SelectTrigger><SelectContent>{cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>; }
function SideNav({ view, setView }: {
    view: View;
    setView: (v: View) => void;
}) { const { setOpenMobile } = useSidebar(); return <Sidebar className="app-sidebar"><SidebarHeader><a href="/" className="brand"><span className="brand-mark"><FileCheck2 size={23}/></span><span>skill<span className="brand-light">passport</span><small>EXPERIENCE GOES FURTHER</small></span></a></SidebarHeader><SidebarContent><div className="nav-caption">MY WORKSPACE</div><SidebarMenu>{nav.map(n => <SidebarMenuItem key={n.id}><SidebarMenuButton isActive={view === n.id} onClick={() => { setView(n.id); setOpenMobile(false); }}><n.icon /><span>{n.label}</span>{n.id === 'training' && <span className="nav-pill">3</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu><div className="nav-caption secondary">ECOSYSTEM DEMO</div><SidebarMenu>{[{ id: 'employer' as View, label: 'Employer view', icon: Building2 }, { id: 'insights' as View, label: 'Workforce insights', icon: Users }].map(n => <SidebarMenuItem key={n.id}><SidebarMenuButton isActive={view === n.id} onClick={() => { setView(n.id); setOpenMobile(false); }}><n.icon /><span>{n.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu><div className="sidebar-note"><Globe2 size={23}/><h3>Your skills travel with you.</h3><p>A new city. A new role.<br />The same valuable experience.</p></div></SidebarContent><SidebarFooter><a className="guide-nav" href="/guide"><BookOpen size={17}/> How this app works</a><div className="sidebar-footer-line"><ShieldCheck size={15}/> Your profile stays private</div></SidebarFooter></Sidebar>; }
function Badge({ children, tone = 'blue' }: {
    children: React.ReactNode;
    tone?: string;
}) { return <span className={`tag ${tone}`}>{children}</span>; }
function Metric({ icon: Icon, label, value, detail }: {
    icon: typeof Users;
    label: string;
    value: string | number;
    detail: string;
}) { return <div className="metric"><div className="metric-top"><span>{label}</span><Icon size={19}/></div><strong>{value}</strong><small>{detail}</small></div>; }
function Empty({ title, children, action }: {
    title: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}) { return <div className="empty-state"><FileCheck2 size={34}/><h3>{title}</h3><p>{children}</p>{action}</div>; }
export default function SkillApp({ signedIn, accountName, signInPath, authReady, authUnavailable, accountId }: {
    signedIn: boolean;
    accountName: string;
    signInPath: string;
    accountId: string|null;
    authReady: boolean;
    authUnavailable: boolean;
}) {
    const [sessionEnded,setSessionEnded]=useState(false);
    async function signOut(){try {const {error}=await createClient().auth.signOut({scope:'local'});if(error)throw error;location.assign('/login');}catch{toast.error('Could not sign out. Please retry.');}}
    useEffect(()=>{const ended=()=>setSessionEnded(true);window.addEventListener('passport-session-ended',ended);return ()=>window.removeEventListener('passport-session-ended',ended);},[]);
    useEffect(()=>{
        if(!authReady||!signedIn)return;
        const {data:{subscription}}=createClient().auth.onAuthStateChange((event,session)=>{
            if(session&&session.user.id!==accountId){location.reload();return;}
            if(event==='SIGNED_OUT'){location.reload();return;}
            if(session)setSessionEnded(false);
        });
        return ()=>subscription.unsubscribe();
    },[authReady,signedIn,accountId]);
    const [view, setView] = useState<View>('overview');
    const [data, setData] = useState<Workspace | null>(null);
    const [loading, setLoading] = useState(signedIn);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState<Profile>(blankProfile);
    const [formError, setFormError] = useState('');
    const [selectedCourse, setSelectedCourse] = useState<typeof courses[number] | null>(null);
    const [previewCity, setPreviewCity] = useState('Delhi');
    const [employerRole, setEmployerRole] = useState('hub');
    const [employerCity, setEmployerCity] = useState('all');
    const reload = useCallback(async () => { setError(''); try {
        const r = await apiRequest('/api/workspace', { cache: 'no-store' });
        const d = await r.json() as Workspace & {
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error || 'Could not load your passport.');
        setData(d);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setLoading(false);
    } }, []);
    useEffect(() => { if (signedIn)
        void reload(); }, [signedIn, reload]);
    useEffect(() => { const onHash = () => { const value = location.hash.slice(1) as View; if ([...nav.map(n => n.id), 'employer', 'insights'].includes(value))
        setView(value); }; onHash(); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
    const navigate = useCallback((v: View) => { setView(v); history.replaceState(null, '', `#${v}`); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
    const mutate = async (url: string, payload: unknown, method = 'PUT') => { const r = await apiRequest(url, { method, headers: { 'Content-Type': 'application/json', 'X-Passport-Owner': accountId || '' }, body: JSON.stringify(payload) }); const d = await r.json() as Workspace & {
        error?: string;
    }; if (!r.ok)
        throw new Error(d.error || 'Could not save your changes.'); };
    const p = data?.profile;
    const workerSkills = data?.skills ?? [];
    const allRoles = data?.roles ?? matchRoles([]);
    const target = allRoles.find(r => r.id === (p?.targetRole ?? 'hub'))!;
    const destination = p?.destination ?? previewCity;
    const certificates = data?.certificates ?? [];
    const recommendedCourses = courses.filter(c => target.missing.includes(c.skillId));
    const localJobs = jobs.filter(j => j.city === destination).map(j => ({ ...j, match: allRoles.find(r => r.id === j.roleId)! })).sort((a, b) => b.match.score - a.match.score);
    const openForm = (sample = false) => { setForm(sample ? { ...sampleProfile, consent: false } : p ? { ...p } : { ...blankProfile }); setFormError(''); setFormOpen(true); };
    const saveForm = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setFormError(''); try {
        await mutate('/api/profile', form);
        await reload();
        setFormOpen(false);
        toast.success('Your work evidence and Skill Passport have been saved.');
    }
    catch (e) {
        setFormError((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    const changeTarget = async (roleId: string, city = destination) => { if (!p) {
        toast.info('Create your passport to save a career goal.');
        return;
    } setBusy(true); try {
        await mutate('/api/target', { roleId, destination: city });
        await reload();
        toast.success('Career goal updated.');
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    const changeCity = async (city: string) => { if (!p) {
        setPreviewCity(city);
        return;
    } await changeTarget(p.targetRole, city); };
    const completeCourse = async () => { if (!selectedCourse)
        return; setBusy(true); try {
        await mutate('/api/training', { courseId: selectedCourse.id }, 'POST');
        await reload();
        setSelectedCourse(null);
        toast.success('Demo credential saved. Your skill match has been recalculated.');
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    const heading = { overview: 'Your next chapter starts here.', passport: 'Experience you can take anywhere.', pathways: 'Find your next step.', training: 'Small steps. Stronger skills.', opportunities: 'Your skills. A new opportunity.', employer: 'Discover the talent already here.', insights: 'See where skilling can make a difference.' }[view];
    const subheading = { overview: p ? `Welcome back, ${p.name.split(' ')[0]}. Let’s turn your experience into new possibilities.` : 'Build your portable skill profile and discover what comes next.', passport: 'Every suggested skill has a clear connection to your work.', pathways: 'Explore the roles within reach and see exactly what to learn.', training: 'Focused learning for the role you want to move into.', opportunities: 'Explore illustrative roles that fit your skills and your destination.', employer: 'Explore a fictional workforce and the skills behind each match.', insights: 'Aggregate patterns from 48 fictional workers. No real worker data is shared.' }[view];
    return <SidebarProvider><SideNav view={view} setView={navigate}/><SidebarInset className="main-surface"><header className="topbar"><div className="breadcrumb"><SidebarTrigger /><span>My workspace</span><ChevronRight size={14}/><strong>{nav.find(n => n.id === view)?.label ?? (view === 'employer' ? 'Employer view' : 'Workforce insights')}</strong></div><div className="account"><Badge tone="neutral">Hackathon prototype</Badge><span className="avatar">{signedIn ? accountName.slice(0, 1).toUpperCase() : 'G'}</span><span className="account-name">{signedIn ? 'My account' : 'Guest preview'}</span>{signedIn && <button className="text-button" onClick={()=>void signOut()} aria-label="Sign out"><LogOut size={17}/></button>}</div></header><main className="page-content"><div className="page-heading"><div><p className="eyebrow">{view === 'overview' ? 'BUILD ON WHAT YOU KNOW' : 'SKILL PASSPORT'}</p><h1>{heading}</h1><p className="subtitle">{subheading}</p></div>{view !== 'employer' && view !== 'insights' && <button className="button outline" onClick={() => openForm()} disabled={!signedIn || loading || !!error}><Plus size={17}/>{p ? 'Update work evidence' : 'Add work evidence'}</button>}</div>
 {!signedIn ? <div className="signin-panel"><div className="large-icon"><ShieldCheck size={28}/></div><div><h2>Your passport belongs to you.</h2><p>Sign in to save your work experience, build your profile, and track your next career move.</p></div><a className="button primary" href={authReady ? signInPath : "/guide"}>{authReady ? "Sign in" : "Finish setup"}</a></div> : null}
 {authUnavailable && <div className="error-banner" role="alert">Sign-in is temporarily unavailable. Please reload in a moment.</div>}
 {sessionEnded && <div className="error-banner" role="alert"><span>Your session ended. Your unsaved form stays in this tab. Sign in again, then retry your action.</span><a className="button primary" href="/login" target="_blank" rel="noopener noreferrer">Sign in again</a></div>}
 {error ? <div className="error-banner" role="alert"><span>{error}</span><button className="button outline" onClick={() => void reload()}><RefreshCw size={16}/>Retry</button></div> : null}
 {loading ? <div className="stats-grid">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-36 rounded-xl"/>)}</div> : <>
 {!p && signedIn && !error && <div className="onboarding"><div><Badge>START HERE</Badge><h2>Your work has a story. Let’s give it a passport.</h2><p>Add your delivery experience, or explore the complete journey with Rahul’s fictional profile.</p></div><div className="button-group"><button className="button primary" onClick={() => openForm(true)}>Try Rahul’s sample profile</button><button className="button outline" onClick={() => openForm()}>Create my own</button></div></div>}
 {view === 'overview' && <><div className="stats-grid"><Metric icon={ShieldCheck} label="Skills identified" value={workerSkills.length.toString().padStart(2, '0')} detail="Linked to evidence or demo learning"/><Metric icon={Waypoints} label="Career pathways" value="04" detail="Roles to explore in your next move"/><Metric icon={GraduationCap} label="Learning completed" value={certificates.length.toString().padStart(2, '0')} detail="Simulated credentials in your passport"/><Metric icon={MapPin} label="Local opportunities" value={localJobs.length.toString().padStart(2, '0')} detail={`Sample roles in ${destination}`}/></div><div className="overview-grid"><section className="pathway-feature"><div className="feature-top"><Badge tone="light"><Sparkles size={13}/> YOUR CAREER GOAL</Badge><span className="mini-caption">{p ? 'Based on your saved evidence' : 'Create a passport to see your match'}</span></div><h2>{target.title}</h2><p>{target.description}</p><div className="readiness"><strong>{target.score}<span>%</span></strong><div><b>skill coverage</b><small>{target.matched.length} of {target.requirements.length} required skills identified</small></div></div><Progress value={target.score} className="feature-progress" aria-label="Target role skill coverage"/><div className="feature-bottom"><span>{target.missing.length} skills to build</span><button className="button white" onClick={() => navigate('pathways')}>Explore this pathway</button></div></section><section className="passport-preview"><div className="section-heading"><h2>My Skill Passport</h2><FileCheck2 size={22}/></div><div className="passport-person"><span className="person-initials">{p ? p.name.split(' ').map(n => n[0]).slice(0, 2).join('') : 'SP'}</span><div><h3>{p?.name ?? 'Your name goes here'}</h3><p>Delivery professional</p><small><MapPin size={13}/>{p?.homeCity ?? 'Your hometown'}</small></div></div><div className="passport-stats"><div><strong>{p ? `${Math.floor(p.months / 12)}y ${p.months % 12}m` : '—'}</strong><small>Experience</small></div><div><strong>{p ? p.deliveries.toLocaleString('en-IN') : '—'}</strong><small>Deliveries</small></div><div><strong>{p?.rating ?? '—'}</strong><small>Rating / 5</small></div></div><div className="passport-foot"><Badge tone="neutral">{p?.isSample ? 'Synthetic profile' : p ? 'Self-reported evidence' : 'Profile not created'}</Badge><button className="text-button" onClick={() => navigate('passport')}>View passport</button></div></section></div><div className="overview-bottom"><section className="panel"><div className="section-heading"><div><h2>Your next learning steps</h2><p>Build the skills your target role needs.</p></div><button className="text-button" onClick={() => navigate('training')}>View all</button></div>{recommendedCourses.length ? recommendedCourses.slice(0, 2).map((c, i) => <button key={c.id} className="learning-row" onClick={() => { navigate('training'); setSelectedCourse(c); }}><span className="course-icon"><BookOpen size={22}/></span><span className="learning-title"><small>STEP {i + 1} · DEMO COURSE</small><b>{c.title}</b><span>{c.hours} hours · {c.language}</span></span><ChevronRight size={18}/></button>) : <div className="completion-note"><CheckCheck size={25}/><p>All target skills are covered in this demo. Explore your local opportunities.</p></div>}</section><section className="mobility-panel"><div className="section-heading"><span className="large-icon small"><Navigation size={23}/></span><Badge tone="neutral">MOBILITY MODE</Badge></div><h2>A new city.<br />The same strong start.</h2><p>Your experience travels with you. Explore opportunities in another city.</p><CitySelect value={destination} onChange={c => void changeCity(c)} disabled={busy}/><button className="button outline full" onClick={() => navigate('opportunities')}>Explore {destination} opportunities</button></section></div><div className="method-note"><Info size={16}/><span>Skill matches are explainable prototype estimates, not hiring probabilities. Training and vacancies are simulated.</span></div></>}
 {view === 'passport' && (p ? <><div className="passport-page-grid"><section className="identity-card"><div className="identity-top"><FileCheck2 size={31}/><span>SKILL PASSPORT<br /><small>PORTABLE WORK EXPERIENCE</small></span></div><h2>{p.name}</h2><p>Delivery professional · {p.homeCity}</p><div className="identity-details"><div><span>Experience</span><b>{p.months} months</b></div><div><span>Completed deliveries</span><b>{p.deliveries.toLocaleString('en-IN')}</b></div><div><span>Customer rating</span><b>{p.rating} / 5</b></div><div><span>On-time delivery</span><b>{p.onTime}%</b></div></div><Badge tone="light">{p.isSample ? 'Synthetic demo evidence' : 'Self-reported evidence'}</Badge><p className="fine-print">The passport describes your evidence. It does not certify occupational competence.</p><a className="button white full" href="/api/export"><Download size={17}/>Download passport JSON</a></section><section className="panel"><div className="section-heading"><div><h2>Skills & supporting evidence</h2><p>{workerSkills.length} skills · click a skill to understand the match</p></div></div>{workerSkills.length ? workerSkills.map(s => <details className="skill-evidence" key={s.id}><summary><span className="skill-check"><Check size={17}/></span><b>{s.name}</b><Badge tone={s.status === 'Demo credential' ? 'amber' : 'blue'}>{s.status}</Badge></summary><p>{s.evidence}</p><small>Source: {s.source}</small></details>) : <p>No skills inferred yet. Add work evidence to begin.</p>}<p className="fine-print">Inferences use fixed, inspectable rules. A worker can update incorrect evidence at any time.</p></section></div><section className="panel credentials"><div className="section-heading"><h2>Learning credentials</h2><Badge tone="neutral">DEMO RECORDS</Badge></div>{certificates.length ? certificates.map(c => <div className="credential-row" key={c.id}><GraduationCap size={24}/><div><b>{courses.find(x => x.id === c.courseId)?.title}</b><p>Simulated completion · {new Date(c.completedAt).toLocaleDateString('en-IN')}</p></div><Badge tone="amber">Not issuer-verified</Badge></div>) : <p>Complete a demo learning step to see how a credential updates your passport.</p>}</section></> : <Empty title="Your passport is waiting" action={signedIn ? <button className="button primary" onClick={() => openForm(true)}>Create a sample passport</button> : null}>Add your experience to see the skills behind your work.</Empty>)}
 {view === 'pathways' && <><div className="info-strip"><Waypoints size={21}/><p><b>Your match is explainable.</b> Each score is the proportion of listed role skills covered by your profile. Scores include simulated credentials where present.</p></div><div className="role-grid">{allRoles.map(r => <section key={r.id} className={`panel role-card ${p?.targetRole === r.id ? 'selected' : ''}`}><div className="section-heading"><span className="role-icon"><BriefcaseBusiness size={22}/></span><Badge tone={p?.targetRole === r.id ? 'blue' : 'neutral'}>{p?.targetRole === r.id ? 'YOUR GOAL' : r.category}</Badge></div><h2>{r.title}</h2><p>{r.description}</p><div className="score-line"><strong>{r.score}%</strong><span>skill coverage · {r.matched.length}/{r.requirements.length}</span></div><Progress value={r.score} aria-label={`${r.title} skill coverage`}/><div className="skill-tags">{r.requirements.map(s => <span key={s} className={r.matched.includes(s) ? 'matched' : 'missing'}>{r.matched.includes(s) ? <Check size={13}/> : <Plus size={13}/>} {skillNames[s]}</span>)}</div><p className="qualification">{r.qualification}</p><button className={`button ${p?.targetRole === r.id ? 'outline' : 'primary'} full`} disabled={!p || busy} onClick={() => p?.targetRole === r.id ? navigate('training') : void changeTarget(r.id)}>{p?.targetRole === r.id ? 'View my learning plan' : 'Set as my career goal'}</button></section>)}</div></>}
 {view === 'training' && <><div className="learning-goal"><GraduationCap size={29}/><div><small>YOUR LEARNING PLAN</small><h2>{target.title}</h2><p>{target.missing.length} missing skills · {certificates.length} demo courses completed</p></div></div><Tabs defaultValue="recommended"><TabsList className="view-tabs"><TabsTrigger value="recommended">Recommended</TabsTrigger><TabsTrigger value="all">All demo courses</TabsTrigger><TabsTrigger value="completed">Completed ({certificates.length})</TabsTrigger></TabsList>{['recommended', 'all', 'completed'].map(tab => <TabsContent value={tab} key={tab}><div className="course-grid">{courses.filter(c => tab === 'recommended' ? target.missing.includes(c.skillId) : tab === 'completed' ? certificates.some(x => x.courseId === c.id) : true).map((c, i) => <section className="panel course-card" key={c.id}><div className={`course-cover cover-${i % 3}`}><BookOpen size={42}/><span>0{courses.indexOf(c) + 1}</span></div><div className="course-body"><Badge tone="neutral">ILLUSTRATIVE TRAINING</Badge><h2>{c.title}</h2><p>{c.description}</p><div className="course-meta"><Clock size={15}/>{c.hours} hours <span>·</span> {c.language}</div><div className="teaches">Builds: <b>{skillNames[c.skillId]}</b></div><button className="button outline full" onClick={() => setSelectedCourse(c)}>{certificates.some(x => x.courseId === c.id) ? 'Review demo credential' : 'View learning step'}</button></div></section>)}</div>{((tab === 'recommended' && !recommendedCourses.length) || (tab === 'completed' && !certificates.length)) && <Empty title={tab === 'completed' ? 'No completed learning yet' : 'Your target skills are covered'}>{tab === 'completed' ? 'Open a recommended learning step to try the simulated completion flow.' : 'Explore another career pathway or your local opportunities.'}</Empty>}</TabsContent>)}</Tabs><div className="source-panel"><ShieldCheck size={22}/><div><b>Explore real training through Skill India Digital Hub</b><p>These demo modules illustrate gap-based recommendations. Government enrollment and certificate verification are not connected.</p></div><a href="https://courses.skillindiadigital.gov.in/courses/" target="_blank" rel="noreferrer" className="button outline">Open official catalog<ExternalLink size={15}/></a></div></>}
 {view === 'opportunities' && <><div className="opportunity-toolbar"><div><h2>{localJobs.length} sample opportunities in {destination}</h2><p>Fictional companies and illustrative monthly salaries.</p></div><CitySelect value={destination} onChange={c => void changeCity(c)} disabled={busy}/></div><div className="jobs-list">{localJobs.map(j => <section className="panel job-card" key={j.id}><span className="company-icon"><Building2 size={25}/></span><div className="job-info"><p>{j.company} <Badge tone="neutral">SAMPLE</Badge></p><h2>{j.title}</h2><div className="job-meta"><span><MapPin size={15}/>{j.city}</span><span><Wallet size={15}/>{j.salary} / month</span><span><Clock size={15}/>{j.shift}</span></div><p className="qualification">{j.match.qualification}</p></div><div className="job-match"><strong>{j.match.score}%</strong><small>skill coverage</small><button className="button outline" disabled={!p || busy} onClick={() => void changeTarget(j.roleId).then(() => navigate('pathways'))}>View pathway</button></div></section>)}</div><div className="source-panel"><BriefcaseBusiness size={24}/><div><b>Ready to look for real vacancies?</b><p>Visit National Career Service. This prototype does not submit job applications.</p></div><a href="https://www.ncs.gov.in/" target="_blank" rel="noreferrer" className="button primary">Visit NCS<ExternalLink size={15}/></a></div></>}
 {view === 'employer' && <><div className="info-strip"><Info size={21}/><p><b>Fictional cohort only.</b> This view never exposes saved worker profiles. Production employer access needs worker consent and server-side organization permissions.</p></div><section className="panel"><div className="employer-filters"><Select value={employerRole} onValueChange={setEmployerRole}><SelectTrigger aria-label="Role to recruit for"><SelectValue /></SelectTrigger><SelectContent>{allRoles.map(r => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent></Select><Select value={employerCity} onValueChange={setEmployerCity}><SelectTrigger aria-label="Worker city"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All cities</SelectItem>{cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><Table><TableHeader><TableRow><TableHead>Demo worker</TableHead><TableHead>City</TableHead><TableHead>Experience</TableHead><TableHead>Skill coverage</TableHead><TableHead>Skills to build</TableHead></TableRow></TableHeader><TableBody>{cohortSummary().workers.filter(w => employerCity === 'all' || w.homeCity === employerCity).map(w => ({ ...w, role: matchRoles(w.skills).find(r => r.id === employerRole)! })).sort((a, b) => b.role.score - a.role.score).map(w => <TableRow key={w.name}><TableCell className="font-medium">{w.name}</TableCell><TableCell>{w.homeCity}</TableCell><TableCell>{w.months} months</TableCell><TableCell><Badge>{w.role.score}%</Badge></TableCell><TableCell>{w.role.missing.map(s => skillNames[s]).join(', ') || 'All listed skills covered'}</TableCell></TableRow>)}</TableBody></Table></section></>}
 {view === 'insights' && <><div className="stats-grid"><Metric icon={Users} label="Sample workforce" value="48" detail="Fictional delivery professionals"/><Metric icon={MapPin} label="Locations" value="05" detail="Cities represented in the demo"/><Metric icon={BookOpen} label="Training themes" value="03" detail="Skills mapped to sample modules"/><Metric icon={Database} label="Real data shared" value="00" detail="Your saved profile remains private"/></div><div className="insights-grid"><section className="panel"><div className="section-heading"><div><h2>Priority training gaps</h2><p>Workers missing each skill in the fictional cohort</p></div></div>{cohortSummary().gaps.map(g => <div className="gap-row" key={g.name}><div><span>{g.name}</span><b>{g.workers} / 48</b></div><Progress value={g.workers / 48 * 100} aria-label={`${g.name}: ${g.workers} of 48 workers`}/></div>)}<p className="fine-print">All sample workers begin without these training skills. This reflects the demo inputs, not measured labor-market demand.</p></section><section className="panel"><h2>Workforce by city</h2>{cohortSummary().cities.map(c => <div className="city-row" key={c.city}><MapPin size={17}/><span>{c.city}</span><b>{c.workers} workers</b></div>)}</section></div><section className="panel outcome-panel"><h2>Connect training to outcomes</h2><p>A production version can track training, interviews, and hiring with consent. This demo calculates skill coverage; it does not claim employment outcomes or live government data.</p></section></>}
 </>}
 <footer className="page-footer"><span>Skill Passport · Built for the next step.</span><a href="/guide">Build & deployment guide</a></footer></main></SidebarInset><Toaster richColors position="bottom-right"/>
 <Dialog open={formOpen} onOpenChange={v => { if (!busy)
        setFormOpen(v); }}><DialogContent className="evidence-dialog"><DialogHeader><DialogTitle>{form.isSample ? 'Explore Rahul’s sample profile' : 'Add your work experience'}</DialogTitle><DialogDescription>Enter your delivery-work metrics. All entries are self-reported; the system explains how it suggests skills.</DialogDescription></DialogHeader><form onSubmit={saveForm}><div className="form-grid"><label className="span-two">Worker name<input required minLength={2} maxLength={80} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label>Home city<CitySelect value={form.homeCity} label="Home city" onChange={v => setForm({ ...form, homeCity: v })}/></label><label>Destination<CitySelect value={form.destination} onChange={v => setForm({ ...form, destination: v })}/></label>{[{ id: 'months', label: 'Months of experience', max: 600, step: 1 }, { id: 'deliveries', label: 'Completed deliveries', max: 1000000, step: 1 }, { id: 'rating', label: 'Customer rating (0–5)', max: 5, step: 0.1 }, { id: 'onTime', label: 'On-time deliveries (%)', max: 100, step: 0.1 }].map(f => <label key={f.id}>{f.label}<input required type="number" min={0} max={f.max} step={f.step} value={form[f.id as 'months']} onChange={e => setForm({ ...form, [f.id]: Number(e.target.value) })}/></label>)}</div><label className="check-label"><Checkbox checked={form.payments} onCheckedChange={v => setForm({ ...form, payments: v === true })}/>I have handled digital payments.</label><label className="check-label"><Checkbox checked={form.isSample} onCheckedChange={v => setForm({ ...form, isSample: v === true })}/>This profile uses fictional sample data.</label><label className="check-label consent"><Checkbox checked={form.consent} onCheckedChange={v => setForm({ ...form, consent: v === true })}/>I agree to save this evidence in my private profile and use it for skill and career recommendations.</label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="button primary full" disabled={busy || !form.consent || !signedIn}>{busy ? <LoaderCircle size={17} className="spin"/> : <ShieldCheck size={17}/>}Save & build my passport</button></form></DialogContent></Dialog>
 <Dialog open={!!selectedCourse} onOpenChange={v => { if (!v && !busy)
        setSelectedCourse(null); }}><DialogContent className="course-dialog"><DialogHeader><Badge tone="amber">SIMULATED TRAINING</Badge><DialogTitle>{selectedCourse?.title}</DialogTitle><DialogDescription>{selectedCourse?.description}</DialogDescription></DialogHeader><div className="lesson-list">{selectedCourse?.lessons.map((l, i) => <div key={l}><span>{i + 1}</span>{l}</div>)}</div><p className="info-strip">This button simulates training completion for your hackathon demo. It does not teach, assess, enroll, or issue a government-recognized certificate.</p><button className="button primary full" disabled={busy || !p || certificates.some(c => c.courseId === selectedCourse?.id)} onClick={() => void completeCourse()}>{busy ? 'Saving…' : certificates.some(c => c.courseId === selectedCourse?.id) ? 'Demo credential already saved' : !p ? 'Create your passport first' : 'Simulate completion & update passport'}</button></DialogContent></Dialog>
 </SidebarProvider>;
}

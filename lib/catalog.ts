export const cities = ['Delhi', 'Patna', 'Mumbai', 'Kolkata', 'Bengaluru'] as const;
export const skills = { field: 'Field operations', customer: 'Customer handling', time: 'Time management', digital: 'Digital payments', volume: 'High-volume task handling', inventory: 'Inventory basics', software: 'Operations software', coordination: 'Shift coordination' } as const;
export type SkillId = keyof typeof skills;
export type Profile = {
    name: string;
    homeCity: string;
    destination: string;
    months: number;
    deliveries: number;
    rating: number;
    onTime: number;
    payments: boolean;
    consent: boolean;
    isSample: boolean;
    targetRole: string;
    updatedAt?: string;
};
export type EvidenceSkill = {
    id: SkillId;
    name: string;
    status: 'Evidence-inferred' | 'Demo credential';
    evidence: string;
    source: string;
};
export const sampleProfile: Profile = { name: 'Rahul Kumar', homeCity: 'Patna', destination: 'Delhi', months: 36, deliveries: 5200, rating: 4.8, onTime: 96, payments: true, consent: true, isSample: true, targetRole: 'hub' };
export const blankProfile: Profile = { name: '', homeCity: 'Patna', destination: 'Delhi', months: 0, deliveries: 0, rating: 0, onTime: 0, payments: false, consent: false, isSample: false, targetRole: 'hub' };
export const roles: {
    id: string;
    title: string;
    category: string;
    description: string;
    requirements: SkillId[];
    salary: string;
    qualification: string;
}[] = [
    { id: 'hub', title: 'Hub Operations Executive', category: 'Logistics', description: 'Keep a delivery hub running smoothly, coordinate dispatches, and manage stock movement.', requirements: ['field', 'customer', 'time', 'digital', 'volume', 'inventory', 'software'], salary: '₹18,000–25,000', qualification: 'Employer assessment of inventory and software skills required.' },
    { id: 'warehouse', title: 'Warehouse Associate', category: 'Warehousing', description: 'Receive, organize, and track goods using an inventory system.', requirements: ['field', 'time', 'volume', 'inventory', 'software'], salary: '₹16,000–22,000', qualification: 'Role-specific safety induction required.' },
    { id: 'support', title: 'Customer Support Associate', category: 'Customer experience', description: 'Help customers resolve order issues and keep clear digital records.', requirements: ['customer', 'digital', 'time', 'software'], salary: '₹17,000–24,000', qualification: 'Language and communication assessment required.' },
    { id: 'dispatch', title: 'Dispatch Coordinator', category: 'Operations', description: 'Coordinate teams and delivery schedules across a busy dispatch floor.', requirements: ['field', 'time', 'volume', 'software', 'coordination'], salary: '₹20,000–28,000', qualification: 'Shift availability and coordination assessment required.' }
];
export const courses: {
    id: string;
    title: string;
    skillId: SkillId;
    hours: number;
    description: string;
    language: string;
    lessons: string[];
}[] = [
    { id: 'inventory', title: 'Inventory & warehouse essentials', skillId: 'inventory', hours: 8, description: 'Practice stock counts, receiving goods, and recording inventory movement.', language: 'Hindi / English', lessons: ['Receiving and checking deliveries', 'Stock counting and reconciliation', 'Recording stock movement'] },
    { id: 'software', title: 'Everyday operations software', skillId: 'software', hours: 6, description: 'Learn spreadsheet basics, order records, and common operations workflows.', language: 'Hindi / English', lessons: ['Entering and checking records', 'Sorting and filtering a spreadsheet', 'Updating order status'] },
    { id: 'coordination', title: 'Team & shift coordination', skillId: 'coordination', hours: 5, description: 'Plan handovers, prioritize work, and communicate with a shift team.', language: 'English', lessons: ['Planning a shift', 'Clear team handovers', 'Handling a delayed dispatch'] }
];
export const jobs = cities.flatMap((city, i) => roles.slice(0, city === 'Patna' ? 2 : city === 'Kolkata' ? 3 : 4).map((r, j) => ({ id: `job-${i}-${j}`, roleId: r.id, title: r.title, city, company: ['Northline Logistics', 'ParcelWorks', 'PeopleFirst Services', 'RouteWorks'][j], salary: r.salary, shift: j % 2 ? 'Day shift' : 'Rotational shift' })));
export function inferSkills(p: Profile, completed: string[] = []): EvidenceSkill[] {
    const out: EvidenceSkill[] = [];
    const add = (id: SkillId, evidence: string, source: string) => out.push({ id, name: skills[id], status: 'Evidence-inferred', evidence, source });
    if (p.months >= 6 && p.deliveries > 0)
        add('field', `${p.months} months and ${p.deliveries.toLocaleString('en-IN')} reported deliveries support field-operations experience.`, 'work_metrics.months + deliveries');
    if (p.rating >= 4 && p.deliveries >= 100)
        add('customer', `${p.rating}/5 reported customer rating and ${p.deliveries.toLocaleString('en-IN')} reported deliveries suggest customer handling.`, 'work_metrics.rating + deliveries');
    if (p.onTime >= 90 && p.deliveries >= 100)
        add('time', `${p.onTime}% reported on-time delivery rate suggests time management.`, 'work_metrics.onTime + deliveries');
    if (p.payments && p.deliveries > 0)
        add('digital', 'Reported experience handling digital payments suggests familiarity with digital transactions.', 'work_metrics.payments + deliveries');
    if (p.deliveries >= 1000)
        add('volume', `${p.deliveries.toLocaleString('en-IN')} reported deliveries suggest high-volume task handling.`, 'work_metrics.deliveries');
    for (const c of courses.filter(c => completed.includes(c.id)))
        out.push({ id: c.skillId, name: skills[c.skillId], status: 'Demo credential', evidence: `Simulated completion of “${c.title}”. Not an accredited or verified qualification.`, source: `demo_course.${c.id}` });
    return out;
}
export function matchRoles(workerSkills: EvidenceSkill[]) { const ids = new Set(workerSkills.map(s => s.id)); return roles.map(r => ({ ...r, matched: r.requirements.filter(s => ids.has(s)), missing: r.requirements.filter(s => !ids.has(s)), score: Math.round(r.requirements.filter(s => ids.has(s)).length / r.requirements.length * 100) })).sort((a, b) => b.score - a.score); }
// Fixed fictional cohort; no records from real accounts are included.
export const cohort = Array.from({ length: 48 }, (_, i) => ({ ...sampleProfile, name: `Demo worker ${String(i + 1).padStart(2, '0')}`, homeCity: cities[i % cities.length], destination: cities[i % cities.length], months: 6 + (i * 7) % 48, deliveries: 200 + (i * 421) % 8000, rating: i % 5 === 0 ? 3.7 : 4.1 + (i % 8) / 10, onTime: i % 4 === 0 ? 84 : 91 + i % 9, payments: i % 3 !== 0 }));
export function cohortSummary() { const workers = cohort.map(p => ({ ...p, skills: inferSkills(p), match: matchRoles(inferSkills(p)).find(r => r.id === 'hub')! })); return { workers, cities: cities.map(city => ({ city, workers: workers.filter(w => w.homeCity === city).length })), gaps: courses.map(c => ({ name: skills[c.skillId], workers: workers.filter(w => !w.skills.some(s => s.id === c.skillId)).length })) }; }

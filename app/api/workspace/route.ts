import { guard, identity, json, workspace } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET() { return guard(async () => { const u = await identity(); return json(await workspace(u.userId)); }); }

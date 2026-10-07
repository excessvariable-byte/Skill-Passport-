import { z } from 'zod';
import { cities, roles, courses } from './catalog';
export const profileSchema = z.object({ name: z.string().trim().min(2).max(80), homeCity: z.enum(cities), destination: z.enum(cities), months: z.number().int().min(0).max(600), deliveries: z.number().int().min(0).max(1000000), rating: z.number().min(0).max(5), onTime: z.number().min(0).max(100), payments: z.boolean(), consent: z.literal(true), isSample: z.boolean(), targetRole: z.string().refine(v => roles.some(r => r.id === v)) });
export const targetSchema = z.object({ roleId: z.string().refine(v => roles.some(r => r.id === v)), destination: z.enum(cities) });
export const trainingSchema = z.object({ courseId: z.string().refine(v => courses.some(c => c.id === v)) });

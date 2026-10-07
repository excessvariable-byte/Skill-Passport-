'use client';
import {createBrowserClient} from '@supabase/ssr';
import {authConfig} from './config';
export function createClient() {
  const {url,key}=authConfig();
  // SSR helper supplies a singleton, cookie persistence, and browser token refresh.
  return createBrowserClient(url,key);
}

import { createBrowserClient } from '@supabase/ssr';

declare global {
  interface Window {
    __ENV__?: {
      NEXT_PUBLIC_SUPABASE_URL?: string;
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?: string;
    };
  }
}

function getPublicEnv() {
  // Prefer runtime-injected values (window.__ENV__ from the server layout) so
  // we don't depend on the bundler inlining NEXT_PUBLIC_* correctly. Fall back
  // to process.env for SSR / module init before window exists.
  const runtime = typeof window !== 'undefined' ? window.__ENV__ : undefined;
  const url =
    runtime?.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    '';
  const key =
    runtime?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    '';
  return { url, key };
}

export function createClient() {
  const { url, key } = getPublicEnv();
  return createBrowserClient(url, key);
}

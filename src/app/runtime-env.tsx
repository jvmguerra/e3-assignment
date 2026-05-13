import 'server-only';

// Injects the public Supabase config into the HTML at request time, so the
// browser client can read it from window.__ENV__ regardless of whether the
// bundler inlined NEXT_PUBLIC_* at build time.
export function RuntimeEnvScript() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? '',
  };
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.__ENV__ = ${JSON.stringify(env)};`,
      }}
    />
  );
}

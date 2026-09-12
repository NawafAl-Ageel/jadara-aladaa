/* Supabase client bootstrap. Reads config from <meta> tags, same as before —
   no secrets in source, url/anon key are safe to expose (RLS enforces access). */

let sbClient;

export function getMeta(name) {
  return (document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '').trim();
}

/* Staging/local run against a separate Supabase project so testing can never
   touch the live leads the team works from. Production is the default — only
   these explicitly-named hosts switch — so no existing access path to the
   real site changes behavior. */
const STAGING_HOSTS = ['staging.dqnh44mdognyi.amplifyapp.com', 'localhost', '127.0.0.1'];

export function isStagingHost() {
  return STAGING_HOSTS.includes(location.hostname);
}

export function initSupabase() {
  if (sbClient) return sbClient;
  const staging = isStagingHost();
  const url = (staging && getMeta('supabase-url-staging')) || getMeta('supabase-url');
  const anonKey = (staging && getMeta('supabase-anon-key-staging')) || getMeta('supabase-anon-key');
  if (!url || !anonKey) throw new Error('Supabase configuration missing (supabase-url / supabase-anon-key).');
  // eslint-disable-next-line no-undef
  sbClient = window.supabase.createClient(url, anonKey);
  return sbClient;
}

export function getSupabase() {
  if (!sbClient) throw new Error('Supabase not initialized yet.');
  return sbClient;
}

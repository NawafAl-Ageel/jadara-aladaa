/* Supabase client bootstrap. Reads config from <meta> tags, same as before —
   no secrets in source, url/anon key are safe to expose (RLS enforces access). */

let sbClient;

export function getMeta(name) {
  return (document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '').trim();
}

export function initSupabase() {
  if (sbClient) return sbClient;
  const url = getMeta('supabase-url');
  const anonKey = getMeta('supabase-anon-key');
  if (!url || !anonKey) throw new Error('Supabase configuration missing (supabase-url / supabase-anon-key).');
  // eslint-disable-next-line no-undef
  sbClient = window.supabase.createClient(url, anonKey);
  return sbClient;
}

export function getSupabase() {
  if (!sbClient) throw new Error('Supabase not initialized yet.');
  return sbClient;
}

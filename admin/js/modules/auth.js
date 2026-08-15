import { $ } from './dom.js';
import { getSupabase } from './supabase-client.js';
import { state } from './state.js';
import { showView, showPage, applyRoleVisibility, applyFeatureReveal } from './nav.js';

export async function loadCurrentProfile() {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    state.currentProfile = null;
    return null;
  }
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    state.currentProfile = null;
    return null;
  }
  state.currentProfile = data;
  return data;
}

export async function checkAuth() {
  try {
    const sb = getSupabase();
    const { data } = await sb.auth.getSession();
    if (data.session?.user) {
      await enterDashboard(data.session.user.email || 'admin');
      return;
    }
    showView('loginView');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    showView('loginView');
  }
}

export async function enterDashboard(username) {
  await loadCurrentProfile();
  showView('adminView');
  applyRoleVisibility();
  applyFeatureReveal();
  showPage('dashboardPage');
  $('#adminUsername').textContent = state.currentProfile?.full_name || username;
}

export async function handleLogin(e) {
  e.preventDefault();
  const sb = getSupabase();
  const btn = $('#loginBtn');
  const errEl = $('#loginError');
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'جارٍ الدخول...';

  try {
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPass').value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await enterDashboard(data.user?.email || email);
  } catch (error) {
    errEl.textContent = error?.message || 'تعذر تسجيل الدخول';
  }

  btn.disabled = false;
  btn.textContent = 'تسجيل الدخول';
}

export async function handleLogout() {
  const sb = getSupabase();
  await sb.auth.signOut();
  state.currentProfile = null;
  showView('loginView');
  $('#loginForm').reset();
  $('#loginError').textContent = '';
}

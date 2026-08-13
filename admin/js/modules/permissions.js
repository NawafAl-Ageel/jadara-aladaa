/* Fixed role -> permission matrix (see docs/consulting-platform-plan.md §2.3).
   This is a UI convenience layer only — real enforcement lives in Postgres RLS
   (supabase/002_profiles_roles_audit.sql, current_user_role()/is_admin()).
   Never trust this module alone for anything sensitive. */

export const ADMIN_ROLES = ['super_admin', 'company_admin'];

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

// Nav tabs that are hidden from non-admins until their module ships proper
// per-role rules (Phase 1+). Everything else is visible to any active staff
// login today, matching current behavior.
const ADMIN_ONLY_TABS = new Set(['teamPage', 'integrationsPage']);

export function canSeeTab(tabId, role) {
  if (!ADMIN_ONLY_TABS.has(tabId)) return true;
  return isAdminRole(role);
}

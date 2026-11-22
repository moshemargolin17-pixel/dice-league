// Dice League account: one Supabase sign-in for the whole site.
// The first page, Dice League Original and Dice League 2.0 all use the same Supabase project, and the
// browser keeps one shared session for it, so signing in (or out) anywhere counts everywhere.
// Needs original/supabase.js and original/config.js loaded first.
window.DLAccount = (() => {
  const CFG = window.DL_CONFIG || {};
  const on = Boolean(CFG.supabaseUrl && CFG.supabaseKey && window.supabase);
  const client = on
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    : null;
  let recovering = false;
  const listeners = [];
  if (client) {
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recovering = true;
      listeners.forEach(fn => fn(event, session));
    });
  }
  async function user() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data && data.session ? data.session.user : null;
  }
  async function signOut() {
    if (client) { try { await client.auth.signOut(); } catch (e) { /* already signed out */ } }
  }
  return {
    on, client, user, signOut,
    isRecovering: () => recovering,
    doneRecovering: () => { recovering = false; },
    onChange: fn => listeners.push(fn),
  };
})();

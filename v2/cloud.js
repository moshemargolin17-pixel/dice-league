// Dice League 2.0: where leagues are saved.
// Signed in: in the account's Supabase table (league_docs), under paths that start with "v2/", so they
// never mix with Dice League Original's data. Not set up for accounts: in this browser, as before.
const Saved = {
  mode: 'local',   // 'cloud' or 'local'
  user: null,
  leagues: [],     // the account's 2.0 leagues
  lastPlayed: {},  // league id -> when it was last opened

  async init() {
    const acc = window.DLAccount;
    if (!acc || !acc.on) { this.loadLocal(); return 'local'; }
    this.user = await acc.user();
    if (!this.user) return 'signed-out';
    this.mode = 'cloud';
    const { data, error } = await acc.client.from('league_docs').select('path,body').like('path', 'v2/%').limit(1000);
    if (error) throw error;
    for (const row of data || []) {
      if (row.path.startsWith('v2/leagues/')) this.leagues.push(row.body);
      if (row.path === 'v2/meta/last-played') this.lastPlayed = row.body || {};
    }
    // First time signed in: bring over any 2.0 leagues made in this browser before accounts existed.
    if (!this.leagues.length) {
      const local = readJSON('dl-leagues', []);
      if (local.length) {
        this.lastPlayed = { ...readJSON('dl-last-played', {}), ...this.lastPlayed };
        for (const lg of local) await this.saveLeague(lg);
        await this.saveLastPlayed();
      }
    }
    return 'cloud';
  },

  loadLocal() {
    this.mode = 'local';
    this.leagues = readJSON('dl-leagues', []);
    this.lastPlayed = readJSON('dl-last-played', {});
  },

  async write(path, body) {
    const { error } = await window.DLAccount.client.from('league_docs').upsert(
      { user_id: this.user.id, path, body, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,path' },
    );
    if (error) throw error;
  },

  async saveLeague(lg) {
    const i = this.leagues.findIndex(x => x.id === lg.id);
    if (i >= 0) this.leagues[i] = lg; else this.leagues.push(lg);
    if (this.mode === 'cloud') await this.write('v2/leagues/' + lg.id, lg);
    else if (!writeJSON('dl-leagues', this.leagues)) throw new Error('blocked');
  },

  async deleteLeague(id) {
    this.leagues = this.leagues.filter(x => x.id !== id);
    if (this.mode === 'cloud') {
      const { error } = await window.DLAccount.client.from('league_docs').delete().eq('path', 'v2/leagues/' + id);
      if (error) throw error;
    } else writeJSON('dl-leagues', this.leagues);
  },

  async saveLastPlayed() {
    if (this.mode === 'cloud') await this.write('v2/meta/last-played', this.lastPlayed);
    else writeJSON('dl-last-played', this.lastPlayed);
  },
};

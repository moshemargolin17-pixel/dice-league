// Dice League: league setup, sample season, and standings math (1 vs 1).
// Nothing here touches the page; app.js draws what these functions return.

// ---------- League setup ----------
// 30 players, 2 conferences, 6 divisions of 5 (3 divisions per conference).
const LEAGUE = {
  name: 'Dice League',
  conferences: ['East', 'West'],
  divisions: [
    { name: 'Atlantic', conf: 0 },
    { name: 'Central', conf: 0 },
    { name: 'Southeast', conf: 0 },
    { name: 'Northwest', conf: 1 },
    { name: 'Pacific', conf: 1 },
    { name: 'Southwest', conf: 1 },
  ],
  players: Array.from({ length: 30 }, (_, i) => ({
    id: i,
    name: 'Player ' + (i + 1),
    div: Math.floor(i / 5),
  })),
  playoffSpots: 6,   // seeds 1-6 go straight to the playoffs
  playInSpots: 4,    // seeds 7-10 go to the play-in
};

const divOf = p => LEAGUE.players[p].div;
const confOf = p => LEAGUE.divisions[divOf(p)].conf;
const playersInConf = c => LEAGUE.players.filter(pl => confOf(pl.id) === c).map(pl => pl.id);
const playersInDiv = d => LEAGUE.players.filter(pl => pl.div === d).map(pl => pl.id);

// ---------- Sample season ----------
// Until real games are logged, the standings show a made-up season so the page has something in it.
// Everyone plays everyone twice (once home, once away): 58 games each, 870 in all.
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSampleSeason() {
  const rand = seededRandom(2026);
  const N = LEAGUE.players.length;
  const pairs = [];
  for (let a = 0; a < N; a++) for (let h = 0; h < N; h++) if (a !== h) pairs.push([a, h]);
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  // Give each sample player a hidden strength so the table spreads out like a real season.
  const strength = LEAGUE.players.map(() => rand() * 10);
  const perDay = 15;
  const playedDays = 34;
  return pairs.map(([away, home], i) => {
    const day = Math.floor(i / perDay) + 1;
    const game = { id: i, day, away, home, final: day <= playedDays };
    if (game.final) {
      const score = p => Math.round(55 + strength[p] + rand() * 30);
      let a = score(away), h = score(home) + 1; // a small home edge
      if (a === h) (rand() < 0.5 ? a++ : h++);
      game.awayPts = a;
      game.homePts = h;
    }
    return game;
  });
}

// ---------- Standings ----------
function emptyRow(p) {
  return {
    p, w: 0, l: 0, hw: 0, hl: 0, aw: 0, al: 0, dw: 0, dl: 0, cw: 0, cl: 0, iw: 0, il: 0,
    pf: 0, pa: 0, results: [], h2h: {}, left: 0,
  };
}

const winPct = (w, l) => (w + l ? w / (w + l) : 0);

// Build one row per player from every game. Only final games count; unplayed ones count as games left.
function computeStandings(games) {
  const rows = LEAGUE.players.map(pl => emptyRow(pl.id));
  const finals = games.filter(g => g.final).sort((x, y) => x.day - y.day || x.id - y.id);

  for (const g of finals) {
    const awayWon = g.awayPts > g.homePts;
    const W = awayWon ? g.away : g.home;
    const L = awayWon ? g.home : g.away;
    const rw = rows[W], rl = rows[L];
    rw.w++; rl.l++;
    if (W === g.home) { rw.hw++; rl.al++; } else { rw.aw++; rl.hl++; }
    if (divOf(W) === divOf(L)) { rw.dw++; rl.dl++; }
    if (confOf(W) === confOf(L)) { rw.cw++; rl.cl++; } else { rw.iw++; rl.il++; }
    rows[g.away].pf += g.awayPts; rows[g.away].pa += g.homePts;
    rows[g.home].pf += g.homePts; rows[g.home].pa += g.awayPts;
    rw.results.push(1); rl.results.push(0);
    (rw.h2h[L] = rw.h2h[L] || [0, 0])[0]++;
    (rl.h2h[W] = rl.h2h[W] || [0, 0])[1]++;
  }
  for (const g of games) if (!g.final) { rows[g.away].left++; rows[g.home].left++; }

  for (const r of rows) {
    r.gp = r.w + r.l;
    r.pct = winPct(r.w, r.l);
    r.diff = r.pf - r.pa;
    const last10 = r.results.slice(-10);
    r.l10 = [last10.filter(x => x).length, last10.filter(x => !x).length];
    const last = r.results[r.results.length - 1];
    let n = 0;
    for (let i = r.results.length - 1; i >= 0 && r.results[i] === last; i--) n++;
    r.streak = r.results.length ? (last ? 'W' : 'L') + n : '—';
  }
  return rows;
}

// Rank a group of players. Ties on record are broken by: head-to-head, then division record
// (if all tied players share a division) or conference record, then point differential.
function rankGroup(rows, ids) {
  const list = ids.map(i => rows[i]);
  list.sort((x, y) => y.pct - x.pct || x.l - y.l || y.w - x.w);
  const out = [];
  let i = 0;
  while (i < list.length) {
    let j = i + 1;
    while (j < list.length && list[j].pct === list[i].pct && list[j].gp === list[i].gp) j++;
    const tied = list.slice(i, j);
    if (tied.length > 1) {
      const tiedIds = tied.map(r => r.p);
      const sameDiv = tiedIds.every(p => divOf(p) === divOf(tiedIds[0]));
      for (const r of tied) {
        let w = 0, l = 0;
        for (const o of tiedIds) if (r.h2h[o]) { w += r.h2h[o][0]; l += r.h2h[o][1]; }
        r.tbH2H = winPct(w, l);
        r.tbGroup = sameDiv ? winPct(r.dw, r.dl) : winPct(r.cw, r.cl);
      }
      tied.sort((x, y) => y.tbH2H - x.tbH2H || y.tbGroup - x.tbGroup || y.diff - x.diff || x.p - y.p);
    }
    out.push(...tied);
    i = j;
  }
  const lead = out[0];
  for (const r of out) r.gb = ((lead.w - r.w) + (r.l - lead.l)) / 2;
  return out;
}

// Clinch marks within each conference, decided by wins alone (the safe, conservative way):
//   z  clinched the #1 seed      X  clinched the playoffs (top 6)
//   PI clinched the play-in (top 10) but can't finish top 6
//   PS clinched the postseason (top 10)   E  eliminated (can't reach the top 10)
function raceMarks(rows) {
  const top = LEAGUE.playoffSpots;
  const post = LEAGUE.playoffSpots + LEAGUE.playInSpots;
  const marks = {};
  for (const r of rows) {
    const p = r.p;
    const others = playersInConf(confOf(p)).filter(q => q !== p);
    const maxW = q => rows[q].w + rows[q].left;
    const clinchedTop = K => others.filter(q => maxW(q) >= r.w).length < K;
    const cantMakeTop = K => others.filter(q => rows[q].w > maxW(p)).length >= K;
    let mark = null;
    if (clinchedTop(1)) mark = 'z';
    else if (clinchedTop(top)) mark = 'X';
    else if (clinchedTop(post) && cantMakeTop(top)) mark = 'PI';
    else if (clinchedTop(post)) mark = 'PS';
    else if (cantMakeTop(post)) mark = 'E';
    marks[p] = mark;
  }
  return marks;
}

const MARKS = {
  z: '#1 seed',
  X: 'Playoffs (top 6)',
  PI: 'Play-in (7–10)',
  PS: 'Postseason (top 10)',
  E: 'Eliminated',
};

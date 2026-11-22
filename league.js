// Dice League: league data, schedules and standings math (1 vs 1).
// Nothing here touches the page; app.js draws what these functions return.
//
// A league looks like:
// {
//   id, name, mode: '1v1', gamesPerPlayer,
//   players: [{ id, name, short, skill, conf, div }],  // skill: 1 (best) to 5; conf/div are indexes or null
//   conferences: ['East', 'West'] or [],               // none, or 2 or more
//   divisions: [{ name, conf }] or [],                  // conf is null when there are no conferences
//   playoffSpots?, playInSpots?,
//   games: [{ id, day, away, home, final, awayPts?, homePts? }],
//   createdAt, lastPlayed, sample?
// }

const SKILLS = [1, 2, 3, 4, 5];

const hasConfs = lg => Boolean(lg.conferences && lg.conferences.length > 1);
const hasDivs = lg => Boolean(lg.divisions && lg.divisions.length > 0);
const divOf = (lg, p) => lg.players[p].div;
const confOf = (lg, p) => lg.players[p].conf;

// League sizes you can pick, and the ways each one can be divided.
// c = number of conferences (0 = everyone in one conference), d = divisions in each conference (0 = none).
const LEAGUE_SIZES = [5, 10, 15, 20, 24, 30];
// Game formats: how many times you play each player in your division (div), the rest of your
// conference (same) and the other conference (other). Setups not listed take any games-per-player number.
const GAME_FORMATS = {
  '5:0x0': [{ same: 3 }, { same: 5 }],
  '10:2x0': [{ same: 3, other: 2 }, { same: 5, other: 2 }],
  '10:0x0': [{ same: 3 }, { same: 5 }],
  '15:0x3': [{ div: 5, same: 3 }],
  '20:2x0': [{ same: 3, other: 2 }, { same: 5, other: 2 }],
  '24:2x3': [{ div: 5, same: 3, other: 2 }],
  '30:2x3': [{ div: 5, same: 3, other: 2 }],
};
const formatsFor = (n, sp) => GAME_FORMATS[`${n}:${sp.c}x${sp.d}`] || null;
const confSize = (n, sp) => (sp.c ? n / sp.c : n);
const divSize = (n, sp) => (sp.d ? confSize(n, sp) / sp.d : 0);
function formatGames(n, sp, f) {
  const conf = confSize(n, sp), div = divSize(n, sp);
  const inConf = f.div && div ? (div - 1) * f.div + (conf - div) * f.same : (conf - 1) * f.same;
  return inConf + (sp.c ? (n - conf) * (f.other || 0) : 0);
}
// How many times players a and b meet under a format.
function formatTimes(lg, f, a, b) {
  const pa = lg.players[a], pb = lg.players[b];
  if (f.div && pa.div != null && pa.div === pb.div) return f.div;
  if (!hasConfs(lg) || pa.conf === pb.conf) return f.same;
  return f.other || 0;
}
const timesText = k => (k === 1 ? 'once' : k === 2 ? 'twice' : `${k} times`);
function formatLabel(n, sp, f) {
  const g = formatGames(n, sp, f);
  const parts = [];
  if (f.div && sp.d) parts.push(`${timesText(f.div)} vs your division`, `${timesText(f.same)} vs the rest of the ${sp.c ? 'conference' : 'league'}`);
  else if (sp.c) parts.push(`${timesText(f.same)} vs your conference`);
  if (sp.c) parts.push(`${timesText(f.other)} vs the other conference`);
  return parts.length ? `${g} games · ${parts.join(', ')}` : `${g} games · play each other ${timesText(f.same)}`;
}
const SPLITS = {
  5: [{ c: 0, d: 0 }],
  10: [{ c: 2, d: 0 }, { c: 0, d: 0 }],
  15: [{ c: 0, d: 3 }],
  20: [{ c: 2, d: 0 }],
  24: [{ c: 2, d: 3 }],
  30: [{ c: 2, d: 3 }],
};
function splitOptions(n) {
  return (SPLITS[n] || []).map(sp => ({ ...sp, size: n / Math.max(sp.c, 1) / Math.max(sp.d, 1) }));
}
const splitKey = sp => `${sp.c}x${sp.d}`;
function splitLabel(sp) {
  if (!sp.c && !sp.d) return `1 conference of ${sp.size}`;
  if (!sp.c) return `1 conference with ${sp.d} divisions of ${sp.size}`;
  if (!sp.d) return `${sp.c} conferences of ${sp.size}`;
  return `${sp.c} conferences, each with ${sp.d} divisions of ${sp.size}`;
}
const CONF_NAMES = { 2: ['East', 'West'], 3: ['East', 'Central', 'West'], 4: ['North', 'South', 'East', 'West'] };
const DIV_NAMES = ['Atlantic', 'Central', 'Southeast', 'Northwest', 'Pacific', 'Southwest', 'Midwest', 'Northeast',
  'Mountain', 'Gulf', 'Coastal', 'Plains', 'Lakes', 'Valley', 'Desert', 'Harbor'];
const allIds = lg => lg.players.map(pl => pl.id);
const playersInConf = (lg, c) => allIds(lg).filter(p => confOf(lg, p) === c);
const playersInDiv = (lg, d) => allIds(lg).filter(p => divOf(lg, p) === d);

// Short name from a full name: initials for several words, first letters for one word,
// and "P7" for "Player 7".
function autoShort(name) {
  const n = String(name || '').trim();
  const numbered = /^player\s*(\d+)$/i.exec(n);
  if (numbered) return 'P' + numbered[1];
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.map(w => w[0]).join('').slice(0, 4).toUpperCase();
  return (words[0] || '').slice(0, 3).toUpperCase();
}

// ---------- Schedule ----------
// Round-robin "circle" schedule: each day everyone plays once (one player sits out when the
// count is odd). Rounds repeat until every player has gamesPerPlayer games. Home and away
// alternate from one day to the next.
function makeSchedule(playerCount, gamesPerPlayer) {
  const slots = Array.from({ length: playerCount }, (_, i) => i);
  if (playerCount % 2) slots.push(-1); // -1 is a bye
  const m = slots.length;
  const count = new Array(playerCount).fill(0);
  const games = [];
  let order = slots.slice();
  let day = 0;
  for (let round = 0; round < 2000 && count.some(c => c < gamesPerPlayer); round++) {
    const today = [];
    for (let i = 0; i < m / 2; i++) {
      const a = order[i], b = order[m - 1 - i];
      if (a < 0 || b < 0 || count[a] >= gamesPerPlayer || count[b] >= gamesPerPlayer) continue;
      const flip = (round + i) % 2 === 1;
      today.push({ away: flip ? a : b, home: flip ? b : a });
      count[a]++; count[b]++;
    }
    if (today.length) {
      day++;
      for (const g of today) games.push({ id: games.length, day, away: g.away, home: g.home, final: false });
    }
    order = [order[0], order[m - 1], ...order.slice(1, m - 1)];
  }
  return balanceHomeAway(games, playerCount);
}

// Even out home and away games across players.
function balanceHomeAway(games, playerCount) {
  // Whoever has had fewer home games so far is at home.
  const homes = new Array(playerCount).fill(0), played = new Array(playerCount).fill(0);
  for (const g of games) {
    const [a, b] = [g.away, g.home];
    const needA = homes[a] - played[a] / 2, needB = homes[b] - played[b] / 2;
    const homeIsA = needA < needB || (needA === needB && g.id % 2 === 0);
    g.home = homeIsA ? a : b;
    g.away = homeIsA ? b : a;
    homes[g.home]++; played[a]++; played[b]++;
  }
  // Then swap home and away in any game where the home player has 2+ more home games than
  // the away player, until no swap helps.
  for (let changed = true, pass = 0; changed && pass < 50; pass++) {
    changed = false;
    for (const g of games) {
      if (homes[g.home] - homes[g.away] >= 2) {
        homes[g.home]--; homes[g.away]++;
        [g.home, g.away] = [g.away, g.home];
        changed = true;
      }
    }
  }
  return games;
}

// Schedule where each pair of players meets a set number of times: timesFor(a, b).
// Each day, players with the most games left are paired first, and a pair that met recently waits.
function makePairSchedule(playerCount, timesFor) {
  const pairs = [];
  for (let a = 0; a < playerCount; a++) for (let b = a + 1; b < playerCount; b++) {
    const k = timesFor(a, b);
    if (k > 0) pairs.push({ a, b, left: k, last: -99 });
  }
  const left = new Array(playerCount).fill(0);
  for (const p of pairs) { left[p.a] += p.left; left[p.b] += p.left; }
  const games = [];
  for (let day = 1; pairs.some(p => p.left > 0) && day < 5000; day++) {
    const busy = new Set();
    const open = pairs.filter(p => p.left > 0)
      .sort((x, y) => (left[y.a] + left[y.b]) - (left[x.a] + left[x.b]) || x.last - y.last);
    for (const p of open) {
      if (busy.has(p.a) || busy.has(p.b) || day - p.last < 2 && open.length > playerCount) continue;
      busy.add(p.a); busy.add(p.b);
      p.left--; p.last = day; left[p.a]--; left[p.b]--;
      games.push({ id: games.length, day, away: p.a, home: p.b, final: false });
    }
  }
  // Renumber days so there are no empty days.
  const days = [...new Set(games.map(g => g.day))].sort((x, y) => x - y);
  for (const g of games) g.day = days.indexOf(g.day) + 1;
  return balanceHomeAway(games, playerCount);
}

// ---------- Sample leagues ----------
// Made-up leagues so the saved list and standings have something in them.
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

function makeSampleLeague({ id, name, seed, playedDays, lastPlayed }) {
  const rand = seededRandom(seed);
  const players = Array.from({ length: 30 }, (_, i) => ({
    id: i, name: 'Player ' + (i + 1), short: 'P' + (i + 1), skill: 1 + Math.floor(rand() * 5),
    div: Math.floor(i / 5), conf: Math.floor(i / 15),
  }));
  const games = makeSchedule(30, 58);
  // Better skill (lower number) scores a little more on average.
  for (const g of games) {
    if (g.day > playedDays) continue;
    const score = p => Math.round(60 + (5 - players[p].skill) * 2.5 + rand() * 30);
    let a = score(g.away), h = score(g.home) + 1; // a small home edge
    if (a === h) (rand() < 0.5 ? a++ : h++);
    Object.assign(g, { final: true, awayPts: a, homePts: h });
  }
  return {
    id, name, mode: '1v1', sample: true, gamesPerPlayer: 58, players, games,
    conferences: ['East', 'West'],
    divisions: [
      { name: 'Atlantic', conf: 0 }, { name: 'Central', conf: 0 }, { name: 'Southeast', conf: 0 },
      { name: 'Northwest', conf: 1 }, { name: 'Pacific', conf: 1 }, { name: 'Southwest', conf: 1 },
    ],
    playoffSpots: 6, playInSpots: 4,
    createdAt: lastPlayed, lastPlayed,
  };
}

// ---------- Standings ----------
function emptyRow(p) {
  return {
    p, w: 0, l: 0, hw: 0, hl: 0, aw: 0, al: 0, dw: 0, dl: 0, cw: 0, cl: 0, iw: 0, il: 0,
    pf: 0, pa: 0, results: [], h2h: {}, left: 0,
  };
}

const winPct = (w, l) => (w + l ? w / (w + l) : 0);

// One row per player from every game. Only final games count; unplayed ones count as games left.
function computeStandings(lg) {
  const confs = hasConfs(lg), divs = hasDivs(lg);
  const rows = lg.players.map(pl => emptyRow(pl.id));
  const finals = lg.games.filter(g => g.final).sort((x, y) => x.day - y.day || x.id - y.id);

  for (const g of finals) {
    const awayWon = g.awayPts > g.homePts;
    const W = awayWon ? g.away : g.home;
    const L = awayWon ? g.home : g.away;
    const rw = rows[W], rl = rows[L];
    rw.w++; rl.l++;
    if (W === g.home) { rw.hw++; rl.al++; } else { rw.aw++; rl.hl++; }
    if (divs && divOf(lg, W) === divOf(lg, L)) { rw.dw++; rl.dl++; }
    if (confs) {
      if (confOf(lg, W) === confOf(lg, L)) { rw.cw++; rl.cl++; } else { rw.iw++; rl.il++; }
    }
    rows[g.away].pf += g.awayPts; rows[g.away].pa += g.homePts;
    rows[g.home].pf += g.homePts; rows[g.home].pa += g.awayPts;
    rw.results.push(1); rl.results.push(0);
    (rw.h2h[L] = rw.h2h[L] || [0, 0])[0]++;
    (rl.h2h[W] = rl.h2h[W] || [0, 0])[1]++;
  }
  for (const g of lg.games) if (!g.final) { rows[g.away].left++; rows[g.home].left++; }

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

// Rank a group of players. Ties on record are broken by head-to-head, then division record
// (if all tied players share a division) or conference record, then point differential.
function rankGroup(lg, rows, ids) {
  const confs = hasConfs(lg), divs = hasDivs(lg);
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
      const sameDiv = divs && tiedIds.every(p => divOf(lg, p) === divOf(lg, tiedIds[0]));
      for (const r of tied) {
        let w = 0, l = 0;
        for (const o of tiedIds) if (r.h2h[o]) { w += r.h2h[o][0]; l += r.h2h[o][1]; }
        r.tbH2H = winPct(w, l);
        r.tbGroup = sameDiv ? winPct(r.dw, r.dl) : confs ? winPct(r.cw, r.cl) : 0;
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

// Clinch marks within each conference, decided by wins alone (the safe, conservative way).
// Only leagues with conferences and playoff spots get them.
function raceMarks(lg, rows) {
  const marks = {};
  if (!hasConfs(lg) || !lg.playoffSpots) return marks;
  const top = lg.playoffSpots;
  const post = lg.playoffSpots + (lg.playInSpots || 0);
  for (const r of rows) {
    const p = r.p;
    const others = playersInConf(lg, confOf(lg, p)).filter(q => q !== p);
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

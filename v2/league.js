// Dice League: league data, schedules and standings math (1 vs 1).
// Nothing here touches the page; app.js draws what these functions return.
//
// A league looks like:
// {
//   id, name, mode: '1v1', gamesPerPlayer,
//   players: [{ id, name, short, skill, conf, div }],  // skill: stars, 3 (best) to 1; conf/div are indexes or null
//   conferences: ['East', 'West'] or [],               // none, or 2 or more
//   divisions: [{ name, conf }] or [],                  // conf is null when there are no conferences
//   playoffs: { spots: 4 | 6 | 8, playIn: bool },     // per conference (or whole league with one conference)
//   games: [{ id, day, away, home, final, awayPts?, homePts? }],
//   createdAt, lastPlayed, sample?
// }

const SKILLS = [1, 2, 3]; // stars: 3 is the best, 1 the lowest
const starText = k => `${'★'.repeat(k)}${'☆'.repeat(3 - k)}`;
const starLabel = k => `${k} star${k === 1 ? '' : 's'}`;

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
  return `${formatGames(n, sp, f)} games`;
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
const MAX_GAMES_PER_DAY = 8;            // regular season
const MAX_POSTSEASON_GAMES_PER_DAY = 4; // play-in and playoffs (used once the postseason is scheduled)

// Each pair of players meets timesFor(a, b) times. Rules:
//  - nobody plays two days in a row (at most every other day)
//  - the same two players meeting in back-to-back games is avoided, but allowed when there's no other choice
//  - about a quarter of the players' games happen each day (never more than 8), so roughly half the
//    league plays on any day and the rest are resting, instead of everyone playing on the same days
// Each day, the available players with the most games left are paired first.
function makePairSchedule(playerCount, timesFor, seed = 1) {
  const rand = seededRandom(seed);
  const key = (a, b) => (a < b ? a * 1000 + b : b * 1000 + a);
  const need = new Map();
  const left = new Array(playerCount).fill(0);
  for (let a = 0; a < playerCount; a++) for (let b = a + 1; b < playerCount; b++) {
    const k = timesFor(a, b);
    if (k > 0) { need.set(key(a, b), k); left[a] += k; left[b] += k; }
  }
  let remaining = left.reduce((x, y) => x + y, 0) / 2;
  const lastDay = new Array(playerCount).fill(-9);
  const lastOpp = new Array(playerCount).fill(-1);
  const games = [];
  const perDay = Math.min(MAX_GAMES_PER_DAY, Math.max(1, Math.round(playerCount / 4)));
  for (let day = 1; remaining > 0 && day < 10000; day++) {
    const avail = [];
    for (let p = 0; p < playerCount; p++) if (left[p] > 0 && day - lastDay[p] >= 2) avail.push(p);
    const tie = new Map(avail.map(p => [p, rand()]));
    avail.sort((x, y) => left[y] - left[x] || tie.get(x) - tie.get(y));
    const used = new Set();
    let today = 0;
    for (const p of avail) {
      if (today >= perDay) break;
      if (used.has(p)) continue;
      let best = -1, bestScore = -Infinity;
      for (const q of avail) {
        if (q === p || used.has(q)) continue;
        const k = need.get(key(p, q)) || 0;
        if (!k) continue;
        // Prefer opponents with many games left and pairs with many meetings left; avoid rematches.
        const score = left[q] * 10 + k * 4 - (lastOpp[p] === q || lastOpp[q] === p ? 1000 : 0) + rand();
        if (score > bestScore) { bestScore = score; best = q; }
      }
      if (best < 0) continue;
      // A rematch only happens if the player has already sat out a few days waiting for someone else.
      if (bestScore < -500 && day - lastDay[p] < 5) continue;
      const q = best;
      used.add(p); used.add(q);
      need.set(key(p, q), need.get(key(p, q)) - 1);
      left[p]--; left[q]--; remaining--;
      lastDay[p] = lastDay[q] = day;
      lastOpp[p] = q; lastOpp[q] = p;
      games.push({ id: games.length, day, away: p, home: q, final: false });
      today++;
    }
  }
  assignHomeAway(games, playerCount);
  return games;
}

// Home and away. For every pair, meetings alternate home and away in date order, so an even number of
// meetings splits evenly and an odd number gives one player a single extra home game. Who gets that
// extra game is chosen so each player's total home games stays within one of half their games.
function assignHomeAway(games, playerCount) {
  const byPair = new Map();
  for (const g of games) {
    const a = Math.min(g.away, g.home), b = Math.max(g.away, g.home);
    const k = a * 1000 + b;
    if (!byPair.has(k)) byPair.set(k, { a, b, list: [] });
    byPair.get(k).list.push(g);
  }
  const pairs = [...byPair.values()];
  const homes = new Array(playerCount).fill(0);
  pairs.forEach((pr, i) => {
    pr.first = i % 2 ? pr.a : pr.b; // gets the extra home game when meetings are odd
    const k = pr.list.length;
    homes[pr.first] += Math.ceil(k / 2);
    homes[pr.first === pr.a ? pr.b : pr.a] += Math.floor(k / 2);
  });
  for (let changed = true, pass = 0; changed && pass < 100; pass++) {
    changed = false;
    for (const pr of pairs) {
      if (pr.list.length % 2 === 0) continue;
      const other = pr.first === pr.a ? pr.b : pr.a;
      if (homes[pr.first] - homes[other] >= 2) {
        homes[pr.first]--; homes[other]++;
        pr.first = other;
        changed = true;
      }
    }
  }
  for (const pr of pairs) {
    const other = pr.first === pr.a ? pr.b : pr.a;
    pr.list.sort((x, y) => x.day - y.day || x.id - y.id);
    pr.list.forEach((g, i) => {
      g.home = i % 2 === 0 ? pr.first : other;
      g.away = i % 2 === 0 ? other : pr.first;
    });
  }
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

// 30 players, 2 conferences with 3 divisions each, 80 games. playedShare is how much of the season is done.
function makeSampleLeague({ id, name, seed, playedShare, lastPlayed }) {
  const rand = seededRandom(seed);
  const players = Array.from({ length: 30 }, (_, i) => ({
    id: i, name: 'Player ' + (i + 1), short: 'P' + (i + 1), skill: 1 + Math.floor(rand() * 3),
    div: Math.floor(i / 5), conf: Math.floor(i / 15),
  }));
  const format = GAME_FORMATS['30:2x3'][0];
  const lg = {
    id, name, mode: '1v1', sample: true, gamesPerPlayer: 80, players, format,
    conferences: ['East', 'West'],
    divisions: [
      { name: 'Atlantic', conf: 0 }, { name: 'Central', conf: 0 }, { name: 'Southeast', conf: 0 },
      { name: 'Northwest', conf: 1 }, { name: 'Pacific', conf: 1 }, { name: 'Southwest', conf: 1 },
    ],
    playoffs: { spots: 8, playIn: true },
    createdAt: lastPlayed, lastPlayed,
  };
  lg.games = makePairSchedule(30, (a, b) => formatTimes(lg, format, a, b), seed);
  const lastDay = Math.round(Math.max(...lg.games.map(g => g.day)) * playedShare);
  // More stars scores a little more on average.
  for (const g of lg.games) {
    if (g.day > lastDay) continue;
    const score = p => Math.round(60 + (players[p].skill - 1) * 4 + rand() * 30);
    let a = score(g.away), h = score(g.home) + 1; // a small home edge
    if (a === h) (rand() < 0.5 ? a++ : h++);
    Object.assign(g, { final: true, awayPts: a, homePts: h });
  }
  return lg;
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

// ---------- Playoffs ----------
// Choices by players per conference (or in the whole league when there is one conference).
const PLAYOFF_CHOICES = { 5: [4], 10: [4, 6, 8], 12: [6, 8], 15: [6, 8] };
const PLAY_IN_SIZES = [15]; // only 15-player conferences can add a play-in (with 8 spots)

// Series length for each round, by playoff size: [first round, next round, conference final].
// The play-in is a single game, and the Finals between conference champions are best of 7.
const SERIES_LENGTHS = { 4: [3, 5], 6: [3, 5, 7], 8: [7, 7, 7] };
const FINALS_LENGTH = 7;
const boText = n => (n === 1 ? 'Single game' : `Best of ${n}`);

// ---------- Postseason schedule ----------
// Built from seeds, so it exists before anyone knows who the seeds are. Rules:
//  - a round starts only after every game of the round before could have finished ("if necessary" games
//    are scheduled too); the play-in's 8-seed game waits for the first two play-in games
//  - at most 4 postseason games a day, and nobody plays two days in a row
//  - the higher seed hosts games 1, 2, 5, 7 of a best of 7; 1, 2, 5 of a best of 5; 1 and 3 of a best of 3.
//    In the play-in the higher seed hosts, and the 7–8 loser hosts the game for the 8 seed.
const HOME_GAMES = { 1: [1], 3: [1, 3], 5: [1, 2, 5], 7: [1, 2, 5, 7] };

// The series of each stage, in the order they're played. A slot is { seed, conf }, { winnerOf } or { loserOf }.
function postseasonSeries(lg) {
  const lines = playoffLines(lg);
  if (!lines) return [];
  const bo = SERIES_LENGTHS[lines.spots];
  const confs = hasConfs(lg) ? lg.conferences.map((_, i) => i) : [null];
  const finalName = confs.length > 1 ? 'Conference final' : 'Final';
  const series = [];
  const add = (stage, round, conf, hi, lo, bestOf, short) => {
    const id = `${conf == null ? 'L' : 'C' + conf}-${round}-${short}`;
    series.push({ id, stage, round, conf, hi, lo, bestOf, short });
    return id;
  };
  const W = id => ({ winnerOf: id }), Lo = id => ({ loserOf: id });
  for (const c of confs) {
    const seed = k => ({ seed: k, conf: c });
    const slot = {};
    for (let k = 1; k <= 10; k++) slot[k] = seed(k);
    if (lines.playIn) {
      const a = add(0, 'Play-in', c, seed(7), seed(8), 1, '7–8');
      const b = add(0, 'Play-in', c, seed(9), seed(10), 1, '9–10');
      const e = add(1, 'Play-in', c, Lo(a), W(b), 1, 'for the 8 seed');
      slot[7] = W(a); slot[8] = W(e);
    }
    const st = lines.playIn ? 2 : 0;
    if (lines.spots === 4) {
      const a = add(st, 'Semifinals', c, slot[1], slot[4], bo[0], '1–4');
      const b = add(st, 'Semifinals', c, slot[2], slot[3], bo[0], '2–3');
      add(st + 1, finalName, c, W(a), W(b), bo[1], 'final');
    } else if (lines.spots === 6) {
      const a = add(st, 'Wild card', c, slot[3], slot[6], bo[0], '3–6');
      const b = add(st, 'Wild card', c, slot[4], slot[5], bo[0], '4–5');
      const s1 = add(st + 1, 'Semifinals', c, slot[1], W(b), bo[1], '1 vs 4–5');
      const s2 = add(st + 1, 'Semifinals', c, slot[2], W(a), bo[1], '2 vs 3–6');
      add(st + 2, finalName, c, W(s1), W(s2), bo[2], 'final');
    } else {
      const a = add(st, 'First round', c, slot[1], slot[8], bo[0], '1–8');
      const b = add(st, 'First round', c, slot[4], slot[5], bo[0], '4–5');
      const d = add(st, 'First round', c, slot[2], slot[7], bo[0], '2–7');
      const e = add(st, 'First round', c, slot[3], slot[6], bo[0], '3–6');
      const s1 = add(st + 1, 'Semifinals', c, W(a), W(b), bo[1], '1–8 vs 4–5');
      const s2 = add(st + 1, 'Semifinals', c, W(d), W(e), bo[1], '2–7 vs 3–6');
      add(st + 2, finalName, c, W(s1), W(s2), bo[2], 'final');
    }
  }
  if (confs.length > 1) {
    const finals = series.filter(x => x.round === finalName);
    add(Math.max(...series.map(x => x.stage)) + 1, 'Finals', null, W(finals[0].id), W(finals[1].id), FINALS_LENGTH, 'Finals');
  }
  return series;
}

// Every postseason game with its day. Games past what a series needs are marked "if necessary".
function buildPostseason(lg, regLastDay) {
  const series = postseasonSeries(lg);
  const games = [];
  let start = regLastDay + 2; // a day off after the regular season
  const stages = [...new Set(series.map(x => x.stage))].sort((a, b) => a - b);
  for (const stage of stages) {
    const list = series.filter(x => x.stage === stage);
    // Series take turns: half play on one day, half the next, so a day never has more than 4 games.
    const perSlot = MAX_POSTSEASON_GAMES_PER_DAY;
    let end = start;
    list.forEach((x, i) => {
      const offset = Math.floor(i / perSlot) % 2;
      x.firstDay = start + offset;
      for (let n = 1; n <= x.bestOf; n++) {
        const day = x.firstDay + 2 * (n - 1);
        const hiHome = HOME_GAMES[x.bestOf].includes(n);
        games.push({ id: 'P' + games.length, day, series: x.id, no: n, ifNecessary: n > Math.ceil(x.bestOf / 2), hiHome });
        end = Math.max(end, day);
      }
      x.lastDay = x.firstDay + 2 * (x.bestOf - 1);
    });
    start = end + 2; // the next round waits for this one, plus a day off
  }
  return { series, games };
}

// Seeds that go straight in, and seeds that go to the play-in.
function playoffLines(lg) {
  const po = lg.playoffs;
  if (!po) return null;
  const playIn = Boolean(po.playIn && po.spots === 8);
  return { direct: playIn ? 6 : po.spots, post: playIn ? 10 : po.spots, playIn, spots: po.spots };
}
// The groups seeded separately: each conference, or the whole league.
const seedGroups = lg => (hasConfs(lg) ? lg.conferences.map((_, ci) => playersInConf(lg, ci)) : [allIds(lg)]);

// Top 6 with divisions: division winners take seeds 1-3 (ordered by record), then the next 3 best records.
const divisionSeeding = lg => Boolean(lg.playoffs && lg.playoffs.spots === 6 && hasDivs(lg));

// Seed order for a group of players (a conference, or the whole league).
function seedOrder(lg, rows, ids) {
  const byRecord = rankGroup(lg, rows, ids);
  if (!divisionSeeding(lg)) return byRecord;
  const divs = [...new Set(ids.map(p => divOf(lg, p)))];
  const winners = divs.map(d => rankGroup(lg, rows, ids.filter(p => divOf(lg, p) === d))[0].p);
  const order = [
    ...rankGroup(lg, rows, winners),
    ...rankGroup(lg, rows, ids.filter(p => !winners.includes(p))),
  ];
  const lead = order[0];
  for (const r of order) r.gb = ((lead.w - r.w) + (r.l - lead.l)) / 2;
  return order;
}

function playoffSummary(spots, playIn, twoConfs, divs) {
  const divNote = spots === 6 && divs ? ' Division winners take seeds 1 to 3 in order of record, and the next 3 best records take seeds 4 to 6.' : '';
  const fin = twoConfs ? ' Conference champions meet in the Finals, best of 7.' : '';
  if (spots === 4) return `Top 4 make it. 1 plays 4 and 2 plays 3 (best of 3), and the winners meet (best of 5).${fin}`;
  if (spots === 6) return `Top 6 make it.${divNote} 1 and 2 get a bye while 3 plays 6 and 4 plays 5 (best of 3). Then 1 plays the 4–5 winner and 2 plays the 3–6 winner (best of 5), and those winners meet (best of 7).${fin}`;
  const pi = playIn ? ' Seeds 7 to 10 play in, one game each: 7 plays 8 for the 7 seed, 9 plays 10, and that winner plays the 7–8 loser for the 8 seed.' : '';
  return `Top 8 make it. 1 plays 8, 4 plays 5, 2 plays 7 and 3 plays 6, then the bracket plays down to one winner. Every series is best of 7.${pi}${fin}`;
}

// Clinch marks within each seeded group. A rival who can at best tie you, and would lose the head-to-head
// tiebreaker even after winning every game left between you, can't pass you (and the same the other way).
// That shortcut is only used when no third player could end on the same record, since a 3-way tie is
// broken among all of them. `skip` is a game to treat as already played (rows already count it).
function raceMarks(lg, rows, skip) {
  const marks = {};
  const lines = playoffLines(lg);
  if (!lines) return marks;
  const meet = {};   // regular-season games still to play between two players
  for (const g of lg.games) if (!g.final && g.id !== skip) {
    const k = Math.min(g.away, g.home) + '-' + Math.max(g.away, g.home);
    meet[k] = (meet[k] || 0) + 1;
  }
  const meetings = (a, b) => meet[Math.min(a, b) + '-' + Math.max(a, b)] || 0;
  const maxW = q => rows[q].w + rows[q].left;
  const games = q => rows[q].gp + rows[q].left;
  const h2h = (a, b) => rows[a].h2h[b] || [0, 0];
  // a beats b in a head-to-head tiebreaker even if b wins every game left between them
  const winsTie = (a, b) => { const [w, l] = h2h(a, b); return w > l + meetings(a, b); };
  for (const group of seedGroups(lg)) {
    // could anyone besides a and b end the season with exactly t wins?
    const third = (a, b, t) => group.some(x => x !== a && x !== b && rows[x].w <= t && t <= maxW(x));
    // q finishes above p however the rest of the season goes
    const ahead = (q, p) => rows[q].w > maxW(p) ||
      (rows[q].w === maxW(p) && games(q) === games(p) && winsTie(q, p) && !third(p, q, maxW(p)));
    // q could still finish above p
    const threat = (q, p) => maxW(q) > rows[p].w ||
      (maxW(q) === rows[p].w && !(games(q) === games(p) && winsTie(p, q) && !third(p, q, rows[p].w)));
    for (const p of group) {
      const others = group.filter(q => q !== p);
      const clinchedTop = K => others.filter(q => threat(q, p)).length < K;
      const cantMakeTop = K => others.filter(q => ahead(q, p)).length >= K;
      let mark = null;
      if (divisionSeeding(lg)) {
        // Top 3 by record is always a top 6 seed; winning the division is too.
        const rivals = others.filter(q => divOf(lg, q) === divOf(lg, p));
        const clinchedDiv = rivals.every(q => !threat(q, p));
        const canWinDiv = rivals.every(q => !ahead(q, p));
        // Players who could still finish level with or above you, not counting division winners already decided
        // (they take seeds 1-3 and never block seeds 4-6). Fewer than 3 of them means a top 6 seed is locked.
        const clinched = q => {
          const qRivals = group.filter(x => x !== q && divOf(lg, x) === divOf(lg, q));
          return qRivals.every(x => !threat(x, q));
        };
        const threats = others.filter(q => threat(q, p) && !clinched(q)).length;
        if (clinchedTop(1)) mark = 'z';
        else if (clinchedDiv) mark = 'y';
        else if (clinchedTop(3) || threats < 3) mark = 'X';
        else if (cantMakeTop(6) && !canWinDiv) mark = 'E';
        marks[p] = mark;
        continue;
      }
      if (clinchedTop(1)) mark = 'z';
      else if (clinchedTop(lines.direct)) mark = 'X';
      else if (lines.playIn && clinchedTop(lines.post) && cantMakeTop(lines.direct)) mark = 'PI';
      else if (lines.playIn && clinchedTop(lines.post)) mark = 'PS';
      else if (cantMakeTop(lines.post)) mark = 'E';
      marks[p] = mark;
    }
  }
  return marks;
}

function markText(lg) {
  const l = playoffLines(lg) || { direct: 0, post: 0 };
  return {
    z: '#1 seed',
    y: 'Won division',
    X: `Playoffs (top ${l.direct})`,
    PI: 'Play-in (7–10)',
    PS: 'Postseason (top 10)',
    E: 'Eliminated',
  };
}

// Dice League: the league's Games, Players, player, Stats and Settings pages.
// Built from final scores only. Quarter, overtime and roll stats come once game logging exists.

const CLOSE_MARGIN = 5;    // a game decided by 5 or fewer is close
const BLOWOUT_MARGIN = 20; // a win by 20 or more is a blowout

// ---------- Shared helpers ----------
const pname = (lg, p) => lg.players[p].name;
const pshort = (lg, p) => lg.players[p].short;
const sign = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x);
const sign1 = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(1);
const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const groupName = (lg, p) => [hasDivs(lg) ? lg.divisions[divOf(lg, p)].name : null, hasConfs(lg) ? lg.conferences[confOf(lg, p)] : null].filter(Boolean).join(' · ');

// Every regular-season game for one player, in date order, from their side.
function gamesOfPlayer(lg, p) {
  return lg.games
    .filter(g => g.away === p || g.home === p)
    .sort((a, b) => a.day - b.day || a.id - b.id)
    .map(g => {
      const home = g.home === p;
      const pts = g.final ? (home ? g.homePts : g.awayPts) : null;
      const opp = g.final ? (home ? g.awayPts : g.homePts) : null;
      return { g, day: g.day, home, vs: home ? g.away : g.home, final: g.final, pts, opp, won: g.final && pts > opp, margin: g.final ? pts - opp : 0 };
    });
}

const tally = list => {
  const w = list.filter(x => x.won).length;
  return { w, l: list.length - w };
};
const recText = list => { const t = tally(list); return rec(t.w, t.l); };
const recPct = list => { const t = tally(list); return t.w + t.l ? t.w / (t.w + t.l) : -1; };

function longestRun(list, want) {
  let best = 0, run = 0;
  for (const x of list) { run = x.won === want ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}

// Everything the player and stats pages need, worked out once per league view.
function playerFacts(lg) {
  const rows = computeStandings(lg);
  const pct = p => rows[p].pct;
  return lg.players.map(pl => {
    const p = pl.id;
    const all = gamesOfPlayer(lg, p);
    const fin = all.filter(x => x.final);
    const wins = fin.filter(x => x.won), losses = fin.filter(x => !x.won);
    const avg = (xs, f) => (xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : null);
    const third = Math.ceil(all.length / 3);
    const part = i => fin.filter(x => { const k = all.indexOf(x); return k >= i * third && k < (i + 1) * third; });
    const restDays = (x, i) => (i === 0 ? null : x.day - fin[i - 1].day - 1);
    return {
      p, rows: rows[p], all, fin,
      ppg: avg(fin, x => x.pts), opg: avg(fin, x => x.opp), margin: avg(fin, x => x.margin),
      mov: avg(wins, x => x.margin), mol: avg(losses, x => x.margin),
      home: fin.filter(x => x.home), away: fin.filter(x => !x.home),
      div: hasDivs(lg) ? fin.filter(x => divOf(lg, x.vs) === divOf(lg, p)) : null,
      conf: hasConfs(lg) ? fin.filter(x => confOf(lg, x.vs) === confOf(lg, p)) : null,
      other: hasConfs(lg) ? fin.filter(x => confOf(lg, x.vs) !== confOf(lg, p)) : null,
      last10: fin.slice(-10),
      vsGood: fin.filter(x => pct(x.vs) >= 0.5), vsBad: fin.filter(x => pct(x.vs) < 0.5),
      close: fin.filter(x => Math.abs(x.margin) <= CLOSE_MARGIN),
      blowWins: wins.filter(x => x.margin >= BLOWOUT_MARGIN), blownOut: losses.filter(x => x.margin <= -BLOWOUT_MARGIN),
      games90: fin.filter(x => x.pts >= 90), games100: fin.filter(x => x.pts >= 100),
      allow80: fin.filter(x => x.opp < 80),
      winRun: longestRun(fin, true), loseRun: longestRun(fin, false),
      early: part(0), mid: part(1), late: part(2),
      rest1: fin.filter((x, i) => restDays(x, i) === 1), rest2: fin.filter((x, i) => restDays(x, i) >= 2),
      homePpg: avg(fin.filter(x => x.home), x => x.pts), awayPpg: avg(fin.filter(x => !x.home), x => x.pts),
      high: fin.length ? Math.max(...fin.map(x => x.pts)) : null,
    };
  });
}

const at = (lg, x) => `${x.home ? 'vs' : '@'} ${pname(lg, x.vs)} · Day ${x.day}`;
const tile = (label, value, sub, tone) =>
  `<div class="tile"><p class="tile-lab">${esc(label)}</p><p class="tile-val${tone ? ' ' + tone : ''}">${value}</p>${sub ? `<p class="tile-sub">${sub}</p>` : ''}</div>`;
const fmt1 = v => (v == null ? '—' : v.toFixed(1));
const toneOf = v => (v == null || v === 0 ? '' : v > 0 ? 'pos' : 'neg');

// ---------- Games ----------
let gamesDay = null;     // day picked in the strip (null = today)
let gamesPlayer = '';    // player whose schedule is shown, '' for the day view

function renderGamesPage(lg) {
  const last = lastDayOf(lg), today = todayOf(lg);
  const day = Math.min(Math.max(gamesDay == null ? today : gamesDay, 1), last);
  const post = postOf(lg);
  const countOn = d => lg.games.filter(g => g.day === d).length + post.games.filter(g => g.day === d).length;
  const doneOn = d => { const gs = lg.games.filter(g => g.day === d); return gs.length > 0 && gs.every(g => g.final); };
  const chips = [];
  for (let d = 1; d <= last; d++) {
    const n = countOn(d);
    chips.push(`<button type="button" class="dchip${d === day ? ' on' : ''}${doneOn(d) ? ' done' : ''}" data-day="${d}" aria-pressed="${d === day}">
      <b>Day ${d}</b><small>${d > seasonDays(lg) ? 'Postseason' : `${n} ${n === 1 ? 'game' : 'games'}`}</small></button>`);
  }
  const opts = lg.players.map(pl => `<option value="${pl.id}"${String(pl.id) === gamesPlayer ? ' selected' : ''}>${esc(pl.name)}</option>`).join('');
  let body;
  if (gamesPlayer !== '') {
    body = scheduleTables(lg, Number(gamesPlayer), true);
  } else {
    const regs = lg.games.filter(g => g.day === day).sort((a, b) => a.id - b.id);
    const posts = post.games.filter(g => g.day === day);
    const seeds = posts.length ? seedsIfKnown(lg) : null;
    const n = regs.length + posts.length;
    body = `<div class="shead"><h2 class="h2">Day ${day}${day > seasonDays(lg) ? ' · Postseason' : ''}</h2><p class="muted">${n} ${n === 1 ? 'game' : 'games'}</p></div>
      <div class="ggrid">${regs.map(g => gameCard(lg, g)).join('')}${posts.map(g => postGameCard(lg, post, g, seeds)).join('') || (regs.length ? '' : '<p class="rempty">No games on this day.</p>')}</div>`;
  }
  $('lgGames').innerHTML = `
    <div class="shead"><h2 class="page-title">Games</h2>
      <label class="sr" for="gamesPlayer">Show a player's schedule</label>
      <select id="gamesPlayer" class="pick"><option value="">Player schedule…</option>${opts}</select></div>
    ${gamesPlayer === '' ? `<div class="dstrip"><button type="button" class="darrow" data-step="-7" aria-label="Earlier days">‹</button>
      <div class="dscroll" id="dscroll">${chips.join('')}</div>
      <button type="button" class="darrow" data-step="7" aria-label="Later days">›</button></div>` : `<button type="button" class="btn btn-ghost btn-sm" id="gamesBack">← All games</button>`}
    ${body}`;
  const on = $('lgGames').querySelector('.dchip.on'), sc = $('dscroll');
  if (on && sc) {
    const delta = on.getBoundingClientRect().left - sc.getBoundingClientRect().left;
    sc.scrollTo({ left: sc.scrollLeft + delta - sc.clientWidth / 2 + on.offsetWidth / 2, behavior: 'instant' });
  }
}

document.addEventListener('click', e => {
  const lg = currentLeague;
  const chip = e.target.closest('#lgGames .dchip');
  if (chip) { gamesDay = Number(chip.dataset.day); renderGamesPage(lg); return; }
  const arrow = e.target.closest('#lgGames .darrow');
  if (arrow) { $('dscroll').scrollBy({ left: Number(arrow.dataset.step) * 90, behavior: 'smooth' }); return; }
  if (e.target.closest('#gamesBack')) { gamesPlayer = ''; renderGamesPage(lg); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'gamesPlayer') { gamesPlayer = e.target.value; renderGamesPage(currentLeague); }
});

// ---------- Players ----------
function renderPlayersPage(lg) {
  const rows = computeStandings(lg);
  const card = p => `<a class="pcard" href="#player-${p}">
      <span class="pcard-name">${esc(pname(lg, p))}</span>
      <span class="pcard-rec">${rec(rows[p].w, rows[p].l)}</span>
      <span class="pcard-strk">${rows[p].streak}</span>
    </a>`;
  const groups = hasDivs(lg)
    ? lg.divisions.map((d, i) => ({ title: d.name, sub: hasConfs(lg) ? lg.conferences[d.conf] : '', ids: playersInDiv(lg, i) }))
    : hasConfs(lg)
      ? lg.conferences.map((c, i) => ({ title: c, sub: '', ids: playersInConf(lg, i) }))
      : [{ title: '', sub: '', ids: allIds(lg) }];
  $('lgPlayers').innerHTML = `<h2 class="page-title">Players</h2>` + groups.map(gr => `
    <section class="pgroup">
      ${gr.title ? `<h3 class="pgroup-title">${esc(gr.title)}${gr.sub ? ` <span>· ${esc(gr.sub)}</span>` : ''}</h3>` : ''}
      <div class="pgrid">${gr.ids.map(card).join('')}</div>
    </section>`).join('');
}

// ---------- A player ----------
const showAll = { up: false, played: false };

function scheduleTables(lg, p, full) {
  const all = gamesOfPlayer(lg, p);
  const upcoming = all.filter(x => !x.final);
  const played = all.filter(x => x.final).reverse();
  let w = all.filter(x => x.final && x.won).length, l = all.filter(x => x.final && !x.won).length;
  const after = played.map(x => { const r = rec(w, l); if (x.won) w--; else l--; return r; });
  const lim = (list, key) => (full || showAll[key] ? list : list.slice(0, 10));
  const more = (list, key) => (!full && list.length > 10
    ? `<button type="button" class="linkbtn" data-more="${key}">${showAll[key] ? 'Show fewer' : `Show all ${list.length}`}</button>` : '');
  const opp = x => `${x.home ? 'vs' : '@'} ${esc(pname(lg, x.vs))}`;
  return `<div class="cols">
    <section class="panel tpanel"><h3 class="panel-title">Upcoming games</h3>
      ${upcoming.length ? `<div class="tscroll"><table class="tbl tbl-plain"><tr><th class="l">Day</th><th class="l">Opponent</th><th>Status</th></tr>
        ${lim(upcoming, 'up').map(x => `<tr><td class="l">${x.day}</td><td class="l">${opp(x)}</td><td>${x.home ? 'Home' : 'Away'}</td></tr>`).join('')}</table></div>${more(upcoming, 'up')}`
        : '<p class="rempty">No games left in the regular season.</p>'}
    </section>
    <section class="panel tpanel"><h3 class="panel-title">Played games</h3>
      ${played.length ? `<div class="tscroll"><table class="tbl tbl-plain"><tr><th class="l">Day</th><th class="l">Opponent</th><th>Result</th><th>Record</th></tr>
        ${lim(played, 'played').map((x, i) => `<tr><td class="l">${x.day}</td><td class="l">${opp(x)}</td><td class="${x.won ? 'pos' : 'neg'}">${x.won ? 'W' : 'L'} ${x.pts}–${x.opp}</td><td>${after[i]}</td></tr>`).join('')}</table></div>${more(played, 'played')}`
        : '<p class="rempty">No games played yet.</p>'}
    </section></div>`;
}

function renderPlayerPage(lg, p) {
  const facts = playerFacts(lg);
  const f = facts[p], r = f.rows;
  const rankBy = (key, asc) => {
    const list = facts.filter(x => x[key] != null).sort((a, b) => (asc ? a[key] - b[key] : b[key] - a[key]));
    const i = list.findIndex(x => x.p === p);
    return i < 0 ? '' : ordinal(i + 1);
  };
  const group = seedGroups(lg).find(ids => ids.includes(p));
  const seedPos = seedOrder(lg, computeStandings(lg), group).findIndex(x => x.p === p) + 1;
  const where = hasConfs(lg) ? 'in conference' : 'in the league';
  const best = (list, fn) => list.reduce((b, x) => (b == null || fn(x) > fn(b) ? x : b), null);
  const hi = best(f.fin, x => x.pts), lo = best(f.fin, x => -x.pts);
  const bigW = best(f.fin.filter(x => x.won), x => x.margin), bigL = best(f.fin.filter(x => !x.won), x => -x.margin);
  const hiC = best(f.fin, x => x.pts + x.opp), loC = best(f.fin, x => -(x.pts + x.opp));
  const recTile = (label, list) => tile(label, list.length ? recText(list) : '0–0');
  const splits = [
    ['Home', f.home], ['Away', f.away],
    ...(f.div ? [['Division', f.div]] : []),
    ...(f.conf ? [['Conference', f.conf], ['Other conference', f.other]] : []),
    ['Last 10', f.last10], ['vs .500 and up', f.vsGood], ['vs under .500', f.vsBad],
    [`Close (${CLOSE_MARGIN} or fewer)`, f.close],
  ];
  const pb = (label, x, value) => tile(label, x ? value(x) : '—', x ? esc(at(lg, x)) : '');
  const pf = f.fin.length ? (f.ppg).toFixed(1) : '—', pa = f.fin.length ? f.opg.toFixed(1) : '—';
  const done = seasonDone(lg);
  $('lgPlayer').innerHTML = `
    <a class="btn btn-ghost btn-sm backbtn" href="#players">← All players</a>
    <div class="shead"><h2 class="page-title">${esc(pname(lg, p))} <span class="stars" aria-label="${starLabel(lg.players[p].skill)}">${starText(lg.players[p].skill)}</span></h2>
      <p class="muted">${esc(groupName(lg, p))}${groupName(lg, p) ? ' · ' : ''}#${seedPos} ${where}</p></div>
    <section class="panel tiles">
      ${tile('Record', rec(r.w, r.l))}
      ${tile('Win %', r.gp ? fmtPct(r.pct) : '—')}
      ${tile('Streak', r.streak)}
      ${tile('Points / game', fmt1(f.ppg), f.ppg != null ? rankBy('ppg') : '')}
      ${tile('Allowed / game', fmt1(f.opg), f.opg != null ? rankBy('opg', true) : '')}
      ${tile('Average margin', f.margin == null ? '—' : sign1(f.margin), '', toneOf(f.margin))}
      ${tile('Margin of victory', f.mov == null ? '—' : sign1(f.mov))}
      ${tile('Margin of loss', f.mol == null ? '—' : sign1(f.mol))}
    </section>
    <div class="cols">
      <section class="panel tpanel"><h3 class="panel-title">Splits</h3>
        <table class="tbl tbl-plain"><tr><th class="l">Split</th><th>W–L</th></tr>
        ${splits.map(([k, list]) => `<tr><td class="l">${esc(k)}</td><td>${recText(list)}</td></tr>`).join('')}</table>
      </section>
      <section class="panel tpanel">
        <div class="bw"><div><h3 class="panel-title">Personal best</h3><div class="tiles tiles-1">
          ${pb('Highest score', hi, x => x.pts)}${pb('Biggest win', bigW, x => sign(x.margin))}${pb('Highest combined', hiC, x => x.pts + x.opp)}
        </div></div>
        <div><h3 class="panel-title">Personal worst</h3><div class="tiles tiles-1">
          ${pb('Lowest score', lo, x => x.pts)}${pb('Biggest loss', bigL, x => sign(x.margin))}${pb('Lowest combined', loC, x => x.pts + x.opp)}
        </div></div></div>
      </section>
    </div>
    <section class="panel tpanel"><h3 class="panel-title">Advanced <span class="panel-sub">Regular season</span></h3>
      <div class="tiles">
        ${tile('90+ games', f.games90.length)}${tile('100+ games', f.games100.length)}
        ${tile('Blowouts', f.blowWins.length, `Wins by ${BLOWOUT_MARGIN}+`)}${tile('Times blown out', f.blownOut.length)}
        ${tile('Longest win streak', f.winRun)}${tile('Longest losing streak', f.loseRun)}
        ${recTile('Scoring 90+', f.games90)}${recTile('Scoring 100+', f.games100)}${recTile('Allowing under 80', f.allow80)}
        ${recTile('Early season', f.early)}${recTile('Mid season', f.mid)}${recTile('Late season', f.late)}
        ${recTile('1 day of rest', f.rest1)}${recTile('2+ days of rest', f.rest2)}
        ${tile('Home points / game', fmt1(f.homePpg))}${tile('Away points / game', fmt1(f.awayPpg))}
      </div>
    </section>
    <h3 class="h2">Schedule</h3>
    ${scheduleTables(lg, p, false)}
    <section class="panel tpanel"><h3 class="panel-title">Career</h3>
      <div class="tscroll"><table class="tbl tbl-plain"><tr><th class="l">Season</th><th>W–L</th><th>PF/G</th><th>PA/G</th><th>Finish</th></tr>
        <tr><td class="l">1</td><td>${rec(r.w, r.l)}</td><td>${pf}</td><td>${pa}</td><td>${done ? `#${seedPos} seed` : 'In progress'}</td></tr>
        <tr class="strong-row"><td class="l">Career</td><td>${rec(r.w, r.l)}</td><td>${pf}</td><td>${pa}</td><td>0 titles</td></tr>
      </table></div>
    </section>`;
}

document.addEventListener('click', e => {
  const b = e.target.closest('#lgPlayer [data-more]');
  if (!b) return;
  showAll[b.dataset.more] = !showAll[b.dataset.more];
  const m = /^player-(\d+)$/.exec(location.hash.slice(1));
  if (m) renderPlayerPage(currentLeague, Number(m[1]));
});
window.addEventListener('hashchange', () => { showAll.up = false; showAll.played = false; });

// ---------- Stats ----------
let statSort = { key: 'pct', asc: false };

function renderStatsPage(lg) {
  const facts = playerFacts(lg);
  const any = facts.some(f => f.fin.length);
  const cols = [
    ['pct', 'PCT', f => f.rows.gp ? f.rows.pct : -1, f => (f.rows.gp ? fmtPct(f.rows.pct) : '—')],
    ['gp', 'GP', f => f.rows.gp, f => f.rows.gp],
    ['w', 'W', f => f.rows.w, f => f.rows.w],
    ['l', 'L', f => f.rows.l, f => f.rows.l],
    ['ppg', 'PPG', f => f.ppg ?? -1, f => fmt1(f.ppg)],
    ['opg', 'OPP', f => f.opg ?? 999, f => fmt1(f.opg)],
    ['diff', 'DIFF', f => f.margin ?? -999, f => (f.margin == null ? '—' : `<span class="${toneOf(f.margin)}">${sign1(f.margin)}</span>`)],
    ['high', 'HIGH', f => f.high ?? -1, f => f.high ?? '—'],
  ];
  const col = cols.find(c => c[0] === statSort.key) || cols[0];
  const sorted = facts.slice().sort((a, b) => (statSort.asc ? col[2](a) - col[2](b) : col[2](b) - col[2](a)) || a.p - b.p);
  const head = `<tr><th class="l">#</th><th class="l">Player</th>${cols.map(c => `<th><button type="button" class="sortbtn${c[0] === statSort.key ? ' on' : ''}" data-sort="${c[0]}">${c[1]}${c[0] === statSort.key ? (statSort.asc ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr>`;
  const body = sorted.map((f, i) => `<tr><td class="l seed">${i + 1}</td><th class="l" scope="row"><a class="plink" href="#player-${f.p}">${esc(pname(lg, f.p))}</a></th>${cols.map(c => `<td>${c[3](f)}</td>`).join('')}</tr>`).join('');

  // Best (▲) and worst (▼) in a category. Short names: these tiles are tight.
  const ranked = (fn, keep = () => true) => facts.filter(f => f.fin.length && keep(f)).sort((a, b) => fn(b) - fn(a) || a.p - b.p);
  const bw = (label, fn, show, keep) => {
    const list = ranked(fn, keep);
    if (!list.length) return tile(label, '—');
    const top = list[0], low = list[list.length - 1];
    return `<div class="tile bwtile"><p class="tile-lab">${esc(label)}</p>
      <p class="bwrow"><span>▲ <b title="${esc(pname(lg, top.p))}">${esc(pshort(lg, top.p))}</b></span><span class="tile-num">${show(top)}</span></p>
      <p class="bwrow muted"><span>▼ <b title="${esc(pname(lg, low.p))}">${esc(pshort(lg, low.p))}</b></span><span class="tile-num">${show(low)}</span></p></div>`;
  };
  const recBW = (label, key) => bw(label, f => recPct(f[key]) + f[key].length / 1e4, f => recText(f[key]), f => f[key] && f[key].length);
  const situational = [
    recBW('vs .500 and up', 'vsGood'), recBW('vs under .500', 'vsBad'), recBW('Home', 'home'), recBW('Away', 'away'),
    recBW(`Close (${CLOSE_MARGIN} or fewer)`, 'close'),
    ...(hasDivs(lg) ? [recBW('Division', 'div')] : []), ...(hasConfs(lg) ? [recBW('Conference', 'conf'), recBW('Other conference', 'other')] : []),
  ];
  const playerStats = [
    bw('Average margin', f => f.margin, f => sign1(f.margin)),
    bw('Margin of victory', f => f.mov ?? -99, f => fmt1(f.mov), f => f.mov != null),
    bw('Lowest score', f => -Math.min(...f.fin.map(x => x.pts)), f => Math.min(...f.fin.map(x => x.pts))),
    bw('90+ games', f => f.games90.length, f => f.games90.length),
    bw('100+ games', f => f.games100.length, f => f.games100.length),
    bw('Blowouts', f => f.blowWins.length, f => f.blowWins.length),
    bw('Times blown out', f => -f.blownOut.length, f => f.blownOut.length),
    bw('Longest win streak', f => f.winRun, f => f.winRun),
    bw('Longest losing streak', f => -f.loseRun, f => f.loseRun),
  ];

  const leaders = (title, fn, show, keep) => {
    const list = ranked(fn, keep).slice(0, 5);
    return `<section class="panel rpanel"><h3 class="panel-title">${esc(title)}</h3>
      ${list.length ? list.map(f => `<div class="rrow"><p class="rlab"><a class="plink" href="#player-${f.p}">${esc(pname(lg, f.p))}</a></p><p class="rval">${show(f)}</p></div>`).join('') : '<p class="rempty">Nothing yet.</p>'}</section>`;
  };
  const finals = lg.games.filter(g => g.final);
  const gameList = (title, fn, show, who, n = 5) => {
    const list = finals.slice().sort((a, b) => fn(b) - fn(a) || a.id - b.id).slice(0, n);
    return `<section class="panel rpanel"><h3 class="panel-title">${esc(title)}</h3>
      ${list.length ? list.map(g => `<div class="rrow"><div class="rrow-text"><p class="rlab">${esc(who(g))}</p><p class="rwho">Day ${g.day}</p></div><p class="rval">${show(g)}</p></div>`).join('') : '<p class="rempty">Nothing yet.</p>'}</section>`;
  };
  const W = g => (g.homePts > g.awayPts ? g.home : g.away), L = g => (g.homePts > g.awayPts ? g.away : g.home);
  const hiPts = g => Math.max(g.homePts, g.awayPts), loPts = g => Math.min(g.homePts, g.awayPts);
  const scoreLine = g => `${pname(lg, g.away)} ${g.awayPts}, ${pname(lg, g.home)} ${g.homePts}`;

  $('lgStats').innerHTML = `
    <h2 class="page-title">Stats</h2>
    ${any ? '' : '<p class="sample">Stats fill in as games are played.</p>'}
    <section class="panel"><h3 class="panel-title">Player leaderboard</h3>
      <div class="tscroll"><table class="tbl tbl-lead">${head}${body}</table></div></section>
    <section class="panel tpanel"><h3 class="panel-title">Situational records</h3><div class="tiles">${situational.join('')}</div></section>
    <section class="panel tpanel"><h3 class="panel-title">Player stats</h3><div class="tiles">${playerStats.join('')}</div></section>
    <h3 class="h2">League leaders</h3>
    <div class="cols2">
      ${leaders(`Best in close games`, f => recPct(f.close) + f.close.length / 1e4, f => recText(f.close), f => f.close.length)}
      ${leaders('Best vs .500 and up', f => recPct(f.vsGood) + f.vsGood.length / 1e4, f => recText(f.vsGood), f => f.vsGood.length)}
      ${leaders('Most blowout wins', f => f.blowWins.length, f => f.blowWins.length, f => f.blowWins.length)}
      ${leaders('Most 90+ games', f => f.games90.length, f => f.games90.length, f => f.games90.length)}
      ${leaders('Most 100+ games', f => f.games100.length, f => f.games100.length, f => f.games100.length)}
      ${leaders('Longest win streak', f => f.winRun, f => f.winRun, f => f.winRun)}
      ${gameList('Highest scores', hiPts, hiPts, g => `${pname(lg, W(g))} vs ${pname(lg, L(g))}`)}
      ${gameList('Biggest wins', g => hiPts(g) - loPts(g), g => '+' + (hiPts(g) - loPts(g)), g => `${pname(lg, W(g))} over ${pname(lg, L(g))}`)}
      ${gameList('Highest combined', g => g.homePts + g.awayPts, g => g.homePts + g.awayPts, scoreLine)}
    </div>
    <h3 class="h2">Lows</h3>
    <div class="cols2">
      ${gameList('Lowest scores', g => -loPts(g), loPts, g => `${pname(lg, L(g))} vs ${pname(lg, W(g))}`)}
      ${gameList('Lowest combined', g => -(g.homePts + g.awayPts), g => g.homePts + g.awayPts, scoreLine)}
    </div>`;
}

document.addEventListener('click', e => {
  const b = e.target.closest('#lgStats [data-sort]');
  if (!b) return;
  const k = b.dataset.sort;
  statSort = statSort.key === k ? { key: k, asc: !statSort.asc } : { key: k, asc: k === 'opg' };
  renderStatsPage(currentLeague);
});

// ---------- Settings ----------
let deleteArmed = false;

function renderSettingsPage(lg) {
  const ro = lg.sample ? ' disabled' : '';
  const finals = lg.games.filter(g => g.final).length;
  const lines = playoffLines(lg);
  const phase = seasonDone(lg) ? 'Postseason' : 'Regular season';
  const confInputs = hasConfs(lg) ? lg.conferences.map((c, i) => `<label class="field"><span class="field-label">Conference ${i + 1}</span><input id="sConf${i}" type="text" maxlength="24" value="${esc(c)}"${ro}></label>`).join('') : '';
  const divInputs = hasDivs(lg) ? lg.divisions.map((d, i) => `<label class="field"><span class="field-label">Division ${i + 1}${hasConfs(lg) ? ` (${esc(lg.conferences[d.conf])})` : ''}</span><input id="sDiv${i}" type="text" maxlength="24" value="${esc(d.name)}"${ro}></label>`).join('') : '';
  const sp = { c: hasConfs(lg) ? lg.conferences.length : 0, d: hasDivs(lg) ? lg.divisions.length / Math.max(1, hasConfs(lg) ? lg.conferences.length : 1) : 0 };
  const gamesText = lg.format ? formatLabel(lg.players.length, sp, lg.format) : `${lg.gamesPerPlayer} games`;
  $('lgSettings').innerHTML = `
    <h2 class="page-title">Settings</h2>
    ${lg.sample ? '<p class="sample">This is a sample league, so its settings can’t be changed. Create a league to edit names and players.</p>' : ''}
    <form class="panel tpanel form-panel" id="sNames" novalidate>
      <h3 class="panel-title">League names</h3>
      <label class="field"><span class="field-label">League name</span><input id="sLgName" type="text" maxlength="40" value="${esc(lg.name)}"${ro}></label>
      ${confInputs ? `<div class="sgrid">${confInputs}</div>` : ''}
      ${divInputs ? `<div class="sgrid sgrid-3">${divInputs}</div>` : ''}
      <p class="error" id="sNamesErr" role="alert" hidden></p>
      <div class="form-actions"><button type="submit" class="btn btn-primary"${ro}>Save names</button><span class="saved-note" id="sNamesOk" hidden>Saved</span></div>
    </form>
    <form class="panel tpanel form-panel" id="sPlayers" novalidate>
      <h3 class="panel-title">Players</h3>
      <div class="tscroll"><table class="tbl tbl-plain tbl-form"><tr><th class="l">#</th><th class="l">Name</th><th class="l">Short name</th><th class="l">This season</th><th class="l">Skill</th></tr>
      ${lg.players.map(pl => `<tr><td class="l">${pl.id + 1}</td>
        <td class="l"><input id="sN${pl.id}" type="text" maxlength="30" value="${esc(pl.name)}" aria-label="Player ${pl.id + 1} name"${ro}></td>
        <td class="l"><input id="sS${pl.id}" class="short-in" type="text" maxlength="4" value="${esc(pl.short)}" aria-label="Player ${pl.id + 1} short name"${ro}></td>
        <td class="l muted">${esc(groupName(lg, pl.id) || lg.name)}</td>
        <td class="l"><select id="sK${pl.id}" aria-label="Player ${pl.id + 1} skill"${ro}>${SKILLS.slice().reverse().map(k => `<option value="${k}" aria-label="${starLabel(k)}"${k === pl.skill ? ' selected' : ''}>${starText(k)}</option>`).join('')}</select></td></tr>`).join('')}
      </table></div>
      <p class="error" id="sPlayersErr" role="alert" hidden></p>
      <div class="form-actions"><button type="submit" class="btn btn-primary"${ro}>Save players</button><span class="saved-note" id="sPlayersOk" hidden>Saved</span></div>
    </form>
    <section class="panel tpanel"><h3 class="panel-title">Season</h3>
      <div class="tiles">
        ${tile('Season', '1')}${tile('Phase', phase)}${tile('Regular-season days', seasonDays(lg))}
        ${tile('Games final', `${finals} / ${lg.games.length}`)}${tile('Games', esc(gamesText.split(' · ')[0]), esc(gamesText.split(' · ')[1] || ''))}
        ${tile('Playoffs', lines ? `Top ${lines.spots}` : 'None', lines && lines.playIn ? 'With a play-in' : '')}
      </div>
    </section>
    ${lg.sample ? '' : `<section class="panel tpanel"><h3 class="panel-title">Delete league</h3>
      <p class="muted">Deletes ${esc(lg.name)} and everything in it from this browser. This can’t be undone.</p>
      <div class="form-actions"><button type="button" class="btn btn-danger" id="sDelete">${deleteArmed ? 'Press again to delete' : 'Delete league'}</button>
      ${deleteArmed ? '<button type="button" class="btn btn-ghost" id="sDeleteCancel">Cancel</button>' : ''}</div></section>`}`;
}

function flash(id) {
  $(id).hidden = false;
  setTimeout(() => { if ($(id)) $(id).hidden = true; }, 1800);
}

document.addEventListener('submit', e => {
  const lg = currentLeague;
  if (lg.sample) return;
  if (e.target.id === 'sNames') {
    e.preventDefault();
    const name = $('sLgName').value.trim();
    const confs = hasConfs(lg) ? lg.conferences.map((_, i) => $('sConf' + i).value.trim()) : [];
    const divs = hasDivs(lg) ? lg.divisions.map((_, i) => $('sDiv' + i).value.trim()) : [];
    const dup = list => list.find((x, i) => list.findIndex(y => y.toLowerCase() === x.toLowerCase()) !== i);
    const err = !name ? 'Give the league a name.'
      : confs.some(x => !x) ? 'Every conference needs a name.'
      : divs.some(x => !x) ? 'Every division needs a name.'
      : dup(confs) ? `Two conferences are both called ${dup(confs)}. Give each one its own name.`
      : dup(divs) ? `Two divisions are both called ${dup(divs)}. Give each one its own name.` : '';
    showError('sNamesErr', err);
    if (err) return;
    lg.name = name;
    if (confs.length) lg.conferences = confs;
    divs.forEach((d, i) => { lg.divisions[i].name = d; });
    saveLeague(lg)
      .then(() => { renderLeagueHeader(lg, 'settings'); flash('sNamesOk'); })
      .catch(() => showError('sNamesErr', 'Couldn’t save. Check your internet connection and try again.'));
  }
  if (e.target.id === 'sPlayers') {
    e.preventDefault();
    const next = lg.players.map(pl => ({
      name: $('sN' + pl.id).value.trim() || `Player ${pl.id + 1}`,
      short: ($('sS' + pl.id).value.trim() || autoShort($('sN' + pl.id).value.trim() || `Player ${pl.id + 1}`)).toUpperCase(),
      skill: Number($('sK' + pl.id).value),
    }));
    const seen = {};
    for (const x of next) {
      if (seen[x.short]) { showError('sPlayersErr', `${seen[x.short]} and ${x.name} both have the short name ${x.short}. Give one of them a different one.`); return; }
      seen[x.short] = x.name;
    }
    showError('sPlayersErr', '');
    next.forEach((x, i) => Object.assign(lg.players[i], x));
    saveLeague(lg)
      .then(() => { renderSettingsPage(lg); flash('sPlayersOk'); })
      .catch(() => showError('sPlayersErr', 'Couldn’t save. Check your internet connection and try again.'));
  }
});

document.addEventListener('input', e => {
  const m = /^sS(\d+)$/.exec(e.target.id || '');
  if (m) e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

document.addEventListener('click', e => {
  if (e.target.id === 'sDeleteCancel') { deleteArmed = false; renderSettingsPage(currentLeague); return; }
  if (e.target.id !== 'sDelete') return;
  if (!deleteArmed) { deleteArmed = true; renderSettingsPage(currentLeague); return; }
  deleteArmed = false;
  Saved.deleteLeague(currentLeague.id)
    .then(() => { location.hash = '1v1'; })
    .catch(() => alertBar('Couldn’t delete the league. Check your internet connection and try again.'));
});
window.addEventListener('hashchange', () => { deleteArmed = false; });

// A short message across the top of the page.
function alertBar(text) {
  let el = $('alertBar');
  if (!el) {
    el = document.createElement('p');
    el.id = 'alertBar';
    el.className = 'alert-bar';
    el.setAttribute('role', 'alert');
    document.querySelector('main').prepend(el);
  }
  el.textContent = text;
}

// ---------- Start ----------
// Load the account's leagues first. Signed out: go to the first page to sign in.
(async () => {
  let state;
  try { state = await Saved.init(); } catch (e) { console.error(e); state = 'error'; }
  if (state === 'signed-out') { location.replace('../index.html?next=v2'); return; }
  if (state === 'error') {
    Saved.loadLocal();
    alertBar('Your leagues couldn’t be loaded from your account, so this shows the ones saved in this browser. Check your internet connection and reload.');
  }
  if (Saved.mode === 'cloud') {
    $('acctWho').textContent = Saved.user.email;
    $('acctWho').hidden = false;
    $('acctOut').hidden = false;
  }
  currentLeague = byLastPlayed()[0];
  selectedLeague = currentLeague;
  showPage();
})();

$('acctOut').addEventListener('click', async () => {
  await window.DLAccount.signOut();
  location.href = '../index.html';
});

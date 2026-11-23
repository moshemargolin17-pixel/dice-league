// Dice League 2.0: playing a game, one possession at a time (see Scoring in league.js).
// A league plays with 3 dice (rolled here or entered from real dice) or 5 dice (rolled by the app).
// The game saves after every possession and turns final when someone reaches 21.
const diceOf = lg => (lg.dice === 5 ? 5 : 3);

const DIE_INFO = { s: { name: 'Score' }, t: { name: 'Shot' }, f: { name: 'Foul' }, ft: { name: 'Free throws' } };
let gameDraft = { id: null, r: {} };   // the possession being entered

// A game to show and play: a regular-season game, or a postseason game with its players filled in.
// { g (what playGame reads), title, meta, playable, canUndo, save() }
function gameRef(lg, id) {
  const reg = lg.games.find(g => String(g.id) === String(id));
  if (reg) return {
    g: reg, meta: gameKind(lg, reg),
    playable: !reg.final && reg.day === todayOf(lg),
    canUndo: !postStarted(lg),   // regular-season results are locked once the postseason starts
    save() {
      const st = playGame(reg);
      reg.final = st.over;
      if (st.over) { reg.awayPts = st.awayPts; reg.homePts = st.homePts; } else { delete reg.awayPts; delete reg.homePts; }
    },
  };
  const ps = postState(lg);
  const pg = ps.post.games.find(g => g.id === id);
  if (!pg) return null;
  const v = postGameView(lg, ps, pg), x = v.s.x;
  if (v.away == null || v.home == null) return { unknown: true, v };
  const res = lg.postResults || {};
  // a postseason result can be undone while nothing after it has been played
  const later = Object.entries(res).some(([gid, r]) => {
    if (gid === pg.id || !r.log || !r.log.length) return false;
    const o = ps.post.games.find(g => g.id === gid);
    return o && (o.day > pg.day || (o.series === pg.series && o.no > pg.no));
  });
  return {
    g: v, post: true,
    meta: `${x.round}${x.bestOf > 1 ? ` · Game ${pg.no}` : ''}${x.conf != null ? ' · ' + lg.conferences[x.conf] : ''}`,
    playable: v.s.next === pg && pg.day === todayOf(lg),
    canUndo: !later,
    save() {
      const st = playGame(v);
      lg.postResults = lg.postResults || {};
      if (!v.log.length) { delete lg.postResults[pg.id]; return; }
      lg.postResults[pg.id] = { away: v.away, home: v.home, log: v.log, final: st.over, ...(st.over ? { awayPts: st.awayPts, homePts: st.homePts } : {}) };
      v.final = st.over;
    },
  };
}


function dieBox(key, value, colorClass, enabled) {
  const faces = DIE_FACES.map(v => `<button type="button" class="face${value === v ? ' on' : ''}" data-act="face" data-die="${key}" data-v="${v}"${enabled ? '' : ' disabled'} aria-label="${DIE_INFO[key].name} die ${v}">${v}</button>`).join('');
  return `<div class="gdie${enabled ? '' : ' off'}">
    <div class="die die-sm ${colorClass}${value ? '' : ' blank'}" data-die-face="${key}" data-value="${value || ''}" role="img" aria-label="${DIE_INFO[key].name} die${value ? ' showing ' + value : ''}"></div>
    <b>${DIE_INFO[key].name}</b>
    <div class="faces">${faces}</div>
  </div>`;
}

// What each die meant on a 5-dice possession.
function diceMeaning(x) {
  const d = x.roll.d, reb = v => (v === 'off' ? 'Offense' : v === 'def' ? 'Defense' : 'Out of bounds');
  const out = [['Shot', d[0], x.turnover ? 'Turnover' : 'Shot'],
    ['Type', d[1], x.turnover ? (x.steal ? 'Steal' : 'Dead ball') : `${x.shot}-pointer`]];
  if (x.turnover) return out.concat([['Foul', d[2], 'Not used'], ['Make', d[3], 'Not used'], ['Free throws', d[4], 'Not used']]);
  out.push(['Foul', d[2], x.foul ? 'Foul' : 'No foul'], ['Make', d[3], (x.made ? 'Make' : 'Miss') + (x.fastBreak ? ' (fast break)' : '')]);
  if (x.fts) out.push(['Free throws', d[4], `${x.ftMade} of ${x.fts}`]);
  else if (!x.foul && !x.made) out.push(['Rebound', d[4], reb(x.reb)]);
  else out.push(['Free throws', d[4], 'Not used']);
  if (x.used === 6) out.push(['Rebound', d[5], reb(x.reb)]);
  return out;
}
const DIE5_COLOR = { Type: 'die-shot', Foul: 'die-foul', Make: 'die-make', 'Free throws': 'die-ft', Rebound: 'die-ft' };
function dice5Html(lg, g, x) {
  // just the dice that were rolled; what they mean is in Settings
  return `<div class="gdice5">${diceMeaning(x).filter(([, , what]) => what !== 'Not used').map(([k, v]) => `<div class="gdie">
      <div class="die die-sm ${k === 'Shot' ? (x.p === g.home ? 'die-red' : 'die-blue') : DIE5_COLOR[k]}" data-die-value="${v}" role="img" aria-label="${k} die showing ${v}"></div></div>`).join('')}</div>`;
}
// A game's box score: one line per player.
function boxScoreHtml(lg, g) {
  const b = boxScore(g);
  const five = (g.log || []).some(r => r.d);   // turnovers, steals, rebounds and 3-point attempts come from 5 dice
  const ma = (m, a) => `${m}–${a}`;
  const cols = [['PTS', x => x.pts], ['FG', x => ma(x.fgm, x.fga)], ['3P', x => (five ? ma(x.tp5m, x.tp5a) : x.tpm)], ['FT', x => ma(x.ftm, x.fta)]]
    .concat(five ? [['OREB', x => x.oreb], ['DREB', x => x.dreb], ['TO', x => x.to], ['STL', x => x.stl], ['FB', x => x.fbp]] : []);
  return `<section class="panel"><h2 class="panel-title">Box score</h2>
    <div class="tscroll"><table class="tbl tbl-plain"><tr><th class="l">Player</th>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr>
    ${[g.away, g.home].map(p => `<tr><td class="l"><a class="plink" href="#player-${p}">${esc(lg.players[p].name)}</a></td>${cols.map(c => `<td>${c[1](b[p])}</td>`).join('')}</tr>`).join('')}
    </table></div>
    ${five ? '<p class="muted bs-key">FB is fast-break points.</p>' : ''}</section>`;
}
const otherOf = (lg, g, p) => lg.players[p === g.home ? g.away : g.home].name;

function renderGamePage(lg, id) {
  const ref = gameRef(lg, id);
  if (!ref) { location.hash = 'league'; return; }
  if (ref.unknown) {
    $('lgGame').innerHTML = `<a class="back" href="#league"><span aria-hidden="true">←</span> Day ${ref.v.day}</a>
      <p class="muted gwait">The players for this game aren’t decided yet.</p>`;
    return;
  }
  const g = ref.g;
  if (gameDraft.id !== g.id) gameDraft = { id: g.id, r: {} };
  const st = playGame(g);
  const name = p => esc(lg.players[p].name);
  const side = (p, isHome) => {
    const pts = isHome ? st.homePts : st.awayPts;
    const ball = !st.over && st.next === p;
    const won = st.over && st.winner === p;
    return `<div class="sb-side${ball ? ' ball' : ''}${won ? ' won' : ''} ${isHome ? 'sb-home' : 'sb-away'}">
      <span class="sb-name"><a class="plink" href="#player-${p}">${name(p)}</a></span>
      <small>${isHome ? 'Home' : 'Away'}${ball ? ' · Has the ball' : ''}</small>
      <span class="sb-pts">${pts}</span>
    </div>`;
  };
  const status = st.over ? 'Final' : st.plays.length ? `Possession ${st.plays.length + 1}` : 'Not started';
  let tray = '';
  const last = st.plays.length ? st.plays[st.plays.length - 1] : null;
  const lastHtml = last && last.roll.d ? dice5Html(lg, g, last) +
    `<p class="gresult"><b>${name(last.p)}</b>: ${esc(playText(last, otherOf(lg, g, last.p)))}${last.pts ? ` · <b>+${last.pts}</b>` : ''}</p>` : '';
  if (!st.over && ref.playable && diceOf(lg) === 5) {
    tray = `<section class="panel gtray">
      <h2 class="panel-title">${name(st.next)} has the ball${st.fastBreak ? ' <span class="panel-sub">Fast break</span>' : ''}</h2>
      ${lastHtml ? `<p class="glast">Last possession</p>${lastHtml}` : ''}
      <div class="gactions">
        <button type="button" class="btn btn-roll" data-act="roll5">Roll</button>
        <button type="button" class="btn btn-ghost" data-act="sim">Roll to the end</button>
      </div>
    </section>`;
  } else if (!st.over && ref.playable) {
    const p = st.next, before = p === g.home ? st.homePts : st.awayPts;
    const r = gameDraft.r;
    const need = possessionNeeds(r, before);
    const res = r.s && r.f && (r.s < 4 || r.t) ? possessionResult(r, before) : null;
    const showFt = res && res.fts > 0;
    const color = p === g.home ? 'die-red' : 'die-blue';
    const done = need.length === 0;
    const preview = done ? `<p class="gresult"><b>${name(p)}</b>: ${esc(playText({ ...res, old: true }))}${res.pts ? ` · <b>+${res.pts}</b>` : ''}</p>` :
      showFt ? `<p class="gresult">Foul! Free throws.</p>` : '';
    tray = `<section class="panel gtray">
      <h2 class="panel-title">${name(p)} has the ball</h2>
      <div class="gdice">
        ${dieBox('s', r.s, color, true)}
        ${dieBox('t', r.t, 'die-shot', !r.s || r.s >= 4)}
        ${dieBox('f', r.f, 'die-foul', true)}
        ${showFt ? dieBox('ft', r.ft, 'die-foul', true) : ''}
      </div>
      ${preview}
      <div class="gactions">
        ${showFt && !r.ft ? '<button type="button" class="btn btn-roll" data-act="roll-ft">Roll free throws</button>' :
          !done ? '<button type="button" class="btn btn-roll" data-act="roll">Roll</button>' : ''}
        <button type="button" class="btn btn-primary" data-act="log"${done ? '' : ' disabled'}>Log possession</button>
        ${Object.keys(r).length ? '<button type="button" class="btn btn-ghost" data-act="clear">Clear</button>' : ''}
      </div>
    </section>`;
  } else if (!st.over) {
    tray = `<p class="muted gwait">${ref.post && ref.g.notNeeded ? 'This game wasn’t needed: the series is over.' : `This game is on Day ${g.day}. Games are played on their day, in order.`}</p>`;
  } else if (st.over && lastHtml) {
    tray = `<section class="panel gtray"><h2 class="panel-title">Last possession</h2>${lastHtml}</section>`;
  }
  const plays = st.plays.slice().reverse().map(x => `<li><span class="pn">${x.n}</span>
      <span class="pw"><b>${name(x.p)}</b> ${esc(playText(x, otherOf(lg, g, x.p)))}${x.pts ? ` <b class="pp">+${x.pts}</b>` : ''}
      <small>Rolled ${x.roll.d ? x.roll.d.slice(0, x.used).join(' · ') : `${x.roll.s}${x.made ? ' · ' + x.roll.t : ''} · ${x.roll.f}${x.fts ? ' · FT ' + x.roll.ft : ''}`}</small></span>
      <span class="ps">${x.away}–${x.home}</span></li>`).join('');
  $('lgGame').innerHTML = `
    <a class="back" href="#league"><span aria-hidden="true">←</span> Day ${g.day}</a>
    ${lg.sample ? '<p class="sample">Sample league: games you play here aren’t saved.</p>' : ''}
    <section class="panel sboard">
      <div class="sb-top"><span>${status}</span><span>${esc(ref.meta ? ref.meta + ' · ' : '')}First to ${GAME_TO}</span></div>
      <div class="sb-body">${side(g.away, false)}<span class="sb-dash" aria-hidden="true">–</span>${side(g.home, true)}</div>
      ${st.over ? `<p class="sb-final"><b>${name(st.winner)}</b> wins ${Math.max(st.homePts, st.awayPts)}–${Math.min(st.homePts, st.awayPts)}.</p>` : ''}
    </section>
    ${tray}
    ${st.plays.length ? boxScoreHtml(lg, g) : ''}
    <section class="panel gplays">
      <div class="gplays-head"><h2 class="panel-title">Play-by-play</h2>
        ${st.plays.length && (ref.playable || (st.over && ref.canUndo)) ? '<button type="button" class="btn btn-ghost btn-sm" data-act="undo">Undo last</button>' : ''}</div>
      ${plays ? `<ol class="plays">${plays}</ol>` : `<p class="muted gnone">No possessions yet. The home player has the ball first${diceOf(lg) === 5 ? '; press Roll' : ''}.</p>`}
    </section>`;
  $('lgGame').querySelectorAll('[data-die-face]').forEach(el => {
    const v = Number(el.dataset.value);
    if (v) drawDie(el, v); else el.innerHTML = '';
    el.setAttribute('aria-label', `${DIE_INFO[el.dataset.dieFace].name} die${v ? ' showing ' + v : ', not rolled'}`);
  });
  $('lgGame').querySelectorAll('[data-die-value]').forEach(el => {
    const label = el.getAttribute('aria-label');
    drawDie(el, Number(el.dataset.dieValue));
    el.setAttribute('aria-label', label);
  });
}

async function saveGame(lg, ref) {
  ref.save();
  if (lg.sample) return;
  try { await saveLeague(lg); markPlayed(lg); } catch (e) { console.error(e); alert('That possession couldn’t be saved. Check your connection and try again.'); }
}

function shake(keys) {
  for (const k of keys) {
    const el = $('lgGame').querySelector(`[data-die-face="${k}"]`);
    if (!el) continue;
    el.classList.remove('rolling'); void el.offsetWidth; el.classList.add('rolling');
  }
}

$('lgGame').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const lg = currentLeague, ref = gameRef(lg, gameDraft.id);
  if (!ref || ref.unknown) return;
  const g = ref.g;
  const st = playGame(g), r = gameDraft.r;
  const before = st.next === g.home ? st.homePts : st.awayPts;
  const act = b.dataset.act;
  if (act === 'roll5' || act === 'sim') {
    if (!ref.playable) return;
    if (act === 'sim' && !confirm('Roll every possession until the game is over?')) return;
    const one = () => {
      const s2 = playGame(g);
      if (s2.over) return false;
      const bf = s2.next === g.home ? s2.homePts : s2.awayPts;
      g.log = (g.log || []).concat([{ d: rollPossession(bf, rollD6, s2.fastBreak) }]);
      return true;
    };
    if (act === 'sim') { while (one()) {} } else one();
    saveGame(lg, ref);
    renderGamePage(lg, g.id); renderLeagueHeader(lg, 'home');
    $('lgGame').querySelectorAll('.gdice5 .die').forEach(el => { el.classList.remove('rolling'); void el.offsetWidth; el.classList.add('rolling'); });
  } else if (act === 'face') {
    r[b.dataset.die] = Number(b.dataset.v);
    if (r.s && r.s < 4) delete r.t;
    const res = r.s && r.f && (r.s < 4 || r.t) ? possessionResult(r, before) : null;
    if (!res || !res.fts) delete r.ft;
    renderGamePage(lg, g.id);
  } else if (act === 'roll') {
    gameDraft.r = { s: rollD6(), t: rollD6(), f: rollD6() };
    if (gameDraft.r.s < 4) delete gameDraft.r.t;
    renderGamePage(lg, g.id); shake(['s', 't', 'f']);
  } else if (act === 'roll-ft') {
    r.ft = rollD6(); renderGamePage(lg, g.id); shake(['ft']);
  } else if (act === 'clear') {
    gameDraft.r = {}; renderGamePage(lg, g.id);
  } else if (act === 'log') {
    if (possessionNeeds(r, before).length) return;
    const entry = { s: r.s, f: r.f };
    if (r.s >= 4) entry.t = r.t;
    if (possessionResult(r, before).fts) entry.ft = r.ft;
    if (!ref.playable) return;
    g.log = (g.log || []).concat([entry]);
    gameDraft.r = {};
    saveGame(lg, ref);
    renderGamePage(lg, g.id); renderLeagueHeader(lg, 'home');
  } else if (act === 'undo') {
    if (!g.log || !g.log.length) return;
    if (g.final && !confirm('Undo the last possession? The game goes back to being in progress.')) return;
    if (!ref.playable && !(g.final && ref.canUndo)) return;
    g.log = g.log.slice(0, playGame(g).plays.length - 1);
    gameDraft.r = {};
    saveGame(lg, ref);
    renderGamePage(lg, g.id); renderLeagueHeader(lg, 'home');
  }
});

// Dice League 2.0: playing a game, one possession at a time (see Scoring in league.js).
// Dice can be rolled here or entered from real dice. The game saves after every possession and
// turns final when someone reaches 21.

const DIE_INFO = {
  s: { name: 'Score', hint: '4–6 scores' },
  t: { name: 'Shot', hint: '5–6 is a 3' },
  f: { name: 'Foul', hint: '6 is a foul' },
  ft: { name: 'Free throws', hint: '' },
};
let gameDraft = { id: null, r: {} };   // the possession being entered

const gameById = (lg, id) => lg.games.find(g => String(g.id) === String(id));
const canPlay = (lg, g) => !g.final ? g.day === todayOf(lg) : true;

function ftHint(res) {
  return res.made ? '4–6 makes the and-one' : '1–2 misses both, 3–4 makes 1, 5–6 makes 2';
}

function dieBox(key, value, colorClass, enabled, hint) {
  const faces = DIE_FACES.map(v => `<button type="button" class="face${value === v ? ' on' : ''}" data-act="face" data-die="${key}" data-v="${v}"${enabled ? '' : ' disabled'} aria-label="${DIE_INFO[key].name} die ${v}">${v}</button>`).join('');
  return `<div class="gdie${enabled ? '' : ' off'}">
    <div class="die die-sm ${colorClass}${value ? '' : ' blank'}" data-die-face="${key}" data-value="${value || ''}" role="img" aria-label="${DIE_INFO[key].name} die${value ? ' showing ' + value : ''}"></div>
    <b>${DIE_INFO[key].name}</b><small>${hint}</small>
    <div class="faces">${faces}</div>
  </div>`;
}

function renderGamePage(lg, id) {
  const g = gameById(lg, id);
  if (!g) { location.hash = 'league'; return; }
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
  if (!st.over && canPlay(lg, g)) {
    const p = st.next, before = p === g.home ? st.homePts : st.awayPts;
    const r = gameDraft.r;
    const need = possessionNeeds(r, before);
    const res = r.s && r.f && (r.s < 4 || r.t) ? possessionResult(r, before) : null;
    const showFt = res && res.fts > 0;
    const color = p === g.home ? 'die-red' : 'die-blue';
    const done = need.length === 0;
    const preview = done ? `<p class="gresult"><b>${name(p)}</b>: ${esc(playText(res))}${res.pts ? ` · <b>+${res.pts}</b>` : ''}</p>` :
      showFt ? `<p class="gresult">Foul! Roll the foul die again for free throws.</p>` : '';
    tray = `<section class="panel gtray">
      <h2 class="panel-title">${name(p)} has the ball</h2>
      <div class="gdice">
        ${dieBox('s', r.s, color, true, DIE_INFO.s.hint)}
        ${dieBox('t', r.t, 'die-shot', !r.s || r.s >= 4, r.s && r.s < 4 ? 'Not needed' : DIE_INFO.t.hint)}
        ${dieBox('f', r.f, 'die-foul', true, DIE_INFO.f.hint)}
        ${showFt ? dieBox('ft', r.ft, 'die-foul', true, ftHint(res)) : ''}
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
    tray = `<p class="muted gwait">This game is on Day ${g.day}. Games are played on their day.</p>`;
  }
  const plays = st.plays.slice().reverse().map(x => `<li><span class="pn">${x.n}</span>
      <span class="pw"><b>${name(x.p)}</b> ${esc(playText(x))}${x.pts ? ` <b class="pp">+${x.pts}</b>` : ''}
      <small>Rolled ${x.roll.s}${x.made ? ' · ' + x.roll.t : ''} · ${x.roll.f}${x.fts ? ' · FT ' + x.roll.ft : ''}</small></span>
      <span class="ps">${x.away}–${x.home}</span></li>`).join('');
  $('lgGame').innerHTML = `
    <a class="back" href="#league"><span aria-hidden="true">←</span> Day ${g.day}</a>
    ${lg.sample ? '<p class="sample">Sample league: games you play here aren’t saved.</p>' : ''}
    <section class="panel sboard">
      <div class="sb-top"><span>${status}</span><span>First to ${GAME_TO}${gameKind(lg, g) ? ' · ' + gameKind(lg, g) : ''}</span></div>
      <div class="sb-body">${side(g.away, false)}<span class="sb-dash" aria-hidden="true">–</span>${side(g.home, true)}</div>
      ${st.over ? `<p class="sb-final"><b>${name(st.winner)}</b> wins ${Math.max(st.homePts, st.awayPts)}–${Math.min(st.homePts, st.awayPts)}.</p>` : ''}
    </section>
    ${tray}
    <section class="panel gplays">
      <div class="gplays-head"><h2 class="panel-title">Play-by-play</h2>
        ${st.plays.length && canPlay(lg, g) ? '<button type="button" class="btn btn-ghost btn-sm" data-act="undo">Undo last</button>' : ''}</div>
      ${plays ? `<ol class="plays">${plays}</ol>` : '<p class="muted gnone">No possessions yet. The home player has the ball first.</p>'}
    </section>`;
  $('lgGame').querySelectorAll('[data-die-face]').forEach(el => {
    const v = Number(el.dataset.value);
    if (v) drawDie(el, v); else el.innerHTML = '';
    el.setAttribute('aria-label', `${DIE_INFO[el.dataset.dieFace].name} die${v ? ' showing ' + v : ', not rolled'}`);
  });
}

async function saveGame(lg, g) {
  const st = playGame(g);
  g.final = st.over;
  if (st.over) { g.awayPts = st.awayPts; g.homePts = st.homePts; } else { delete g.awayPts; delete g.homePts; }
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
  const lg = currentLeague, g = gameById(lg, gameDraft.id);
  if (!g) return;
  const st = playGame(g), r = gameDraft.r;
  const before = st.next === g.home ? st.homePts : st.awayPts;
  const act = b.dataset.act;
  if (act === 'face') {
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
    g.log = (g.log || []).concat([entry]);
    gameDraft.r = {};
    saveGame(lg, g);
    renderGamePage(lg, g.id); renderLeagueHeader(lg, 'home');
  } else if (act === 'undo') {
    if (!g.log || !g.log.length) return;
    if (g.final && !confirm('Undo the last possession? The game goes back to being in progress.')) return;
    g.log = g.log.slice(0, playGame(g).plays.length - 1);
    gameDraft.r = {};
    saveGame(lg, g);
    renderGamePage(lg, g.id); renderLeagueHeader(lg, 'home');
  }
});

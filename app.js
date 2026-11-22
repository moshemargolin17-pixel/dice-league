// Dice League: home page dice tray, 1 vs 1 leagues, new league setup, standings and page switching.

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtPct = x => (x === 1 ? '1.000' : x.toFixed(3).replace(/^0/, ''));
const rec = (w, l) => `${w}–${l}`;
const perGame = (n, gp) => (gp ? (n / gp).toFixed(1) : '—');

// Browser storage can be blocked or empty, so every read and write is guarded.
function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

// ---------- Dice tray ----------
// Where the pips sit on a 3x3 grid for each face (row, column).
const PIPS = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [2, 1], [3, 1], [1, 3], [2, 3], [3, 3]],
};

function drawDie(el, value) {
  el.innerHTML = PIPS[value]
    .map(([r, c]) => `<span class="pip" style="grid-area:${r}/${c}"></span>`)
    .join('');
  el.dataset.value = value;
  const color = el.classList.contains('die-red') ? 'Red' : 'Blue';
  el.setAttribute('aria-label', `${color} die showing ${value}`);
}

const rollD6 = () => 1 + Math.floor(Math.random() * 6);
const dieA = $('dieA');
const dieB = $('dieB');
drawDie(dieA, Number(dieA.dataset.value));
drawDie(dieB, Number(dieB.dataset.value));

$('rollBtn').addEventListener('click', () => {
  const a = rollD6();
  const b = rollD6();
  for (const die of [dieA, dieB]) {
    die.classList.remove('rolling');
    void die.offsetWidth; // restart the animation
    die.classList.add('rolling');
  }
  setTimeout(() => { drawDie(dieA, a); drawDie(dieB, b); }, 220);
});

// ---------- Saved leagues ----------
// Leagues you create are saved in this browser. The three sample leagues are always listed
// so there is something to look at.
const SAMPLE_LEAGUES = [
  { id: 'sample-dice-league', name: 'Dice League', seed: 2026, playedDays: 34, lastPlayed: '2026-11-21T21:00:00.000Z' },
  { id: 'sample-friday-night', name: 'Friday Night League', seed: 77, playedDays: 12, lastPlayed: '2026-11-14T22:30:00.000Z' },
  { id: 'sample-summer', name: 'Summer League', seed: 413, playedDays: 58, lastPlayed: '2026-08-30T19:15:00.000Z' },
].map(makeSampleLeague);

const myLeagues = () => readJSON('dl-leagues', []);
const allLeagues = () => [...myLeagues(), ...SAMPLE_LEAGUES];
const findLeague = id => allLeagues().find(lg => lg.id === id);

function saveLeague(lg) {
  const list = myLeagues().filter(x => x.id !== lg.id);
  list.push(lg);
  return writeJSON('dl-leagues', list);
}

const lastPlayedOf = lg => readJSON('dl-last-played', {})[lg.id] || lg.lastPlayed;
function markPlayed(lg) {
  const map = readJSON('dl-last-played', {});
  map[lg.id] = new Date().toISOString();
  writeJSON('dl-last-played', map);
}
const byLastPlayed = () => allLeagues().sort((a, b) => lastPlayedOf(b).localeCompare(lastPlayedOf(a)));

let currentLeague = byLastPlayed()[0];  // the league the standings page shows
let selectedLeague = currentLeague;     // the league highlighted on the 1 vs 1 page

function whenText(iso) {
  const d = new Date(iso), now = new Date();
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

function leagueSummary(lg) {
  const finals = lg.games.filter(g => g.final);
  if (!finals.length) return { progress: `Not started · 0/${lg.games.length}`, leader: '—' };
  const lead = rankGroup(lg, computeStandings(lg), allIds(lg))[0];
  return {
    progress: `Day ${Math.max(...finals.map(g => g.day))} · ${finals.length}/${lg.games.length}`,
    leader: `${lg.players[lead.p].name} (${rec(lead.w, lead.l)})`,
  };
}

function renderSavedLeagues() {
  $('savedLeagues').innerHTML = byLastPlayed().map(lg => {
    const s = leagueSummary(lg);
    const on = lg.id === selectedLeague.id;
    return `<button type="button" class="saved" role="radio" aria-checked="${on}" data-id="${esc(lg.id)}">
      <span class="saved-name">${esc(lg.name)}${lg.sample ? ' <span class="tag">Sample</span>' : ''}</span>
      <span class="saved-col">${lg.players.length}</span>
      <span class="saved-col">${s.progress}</span>
      <span class="saved-col">${esc(s.leader)}</span>
      <span class="saved-col saved-when">${whenText(lastPlayedOf(lg))}</span>
    </button>`;
  }).join('');
  $('continueName').textContent = selectedLeague.name;
}

$('savedLeagues').addEventListener('click', e => {
  const b = e.target.closest('.saved');
  if (!b) return;
  selectedLeague = findLeague(b.dataset.id);
  renderSavedLeagues();
});

function openLeague(lg) {
  currentLeague = lg;
  markPlayed(lg);
  location.hash = 'standings';
}
$('continueBtn').addEventListener('click', () => openLeague(selectedLeague));

// ---------- New league setup ----------
// Step 1: league name, number of players, games per player.
// Step 2: each player's name, initials and skill.
// What has been typed so far, kept when going back and forth between the steps.
const draft = { players: [], split: { c: 0, d: 0, size: 0 }, confNames: [], divNames: [], groupsFor: '' };

// The groups players are placed in: divisions if there are any, otherwise conferences.
function draftGroups() {
  const { c, d } = draft.split;
  if (d) {
    const groups = [];
    for (let ci = 0; ci < Math.max(c, 1); ci++) for (let di = 0; di < d; di++) {
      const i = c ? ci * d + di : di;
      groups.push({ label: (draft.divNames[i] || '').trim() + (c ? ' · ' + (draft.confNames[ci] || '').trim() : '') });
    }
    return groups;
  }
  if (c) return draft.confNames.slice(0, c).map(n => ({ label: (n || '').trim() }));
  return [];
}

// Setups with fixed game formats get a dropdown; the rest get a number box.
function renderGameChoices() {
  const n = Number($('nlPlayers').value);
  const formats = formatsFor(n, draft.split);
  $('nlGames').hidden = Boolean(formats);
  $('nlGamesPick').hidden = !formats;
  $('nlGamesLabel').htmlFor = formats ? 'nlGamesPick' : 'nlGames';
  if (formats) {
    const keep = Number($('nlGamesPick').value) || 0;
    $('nlGamesPick').innerHTML = formats.map((f, i) =>
      `<option value="${i}"${i === keep ? ' selected' : ''}>${formatLabel(n, draft.split, f)}</option>`).join('');
  }
}

function renderSplits() {
  const n = Number($('nlPlayers').value);
  const wrap = $('nlSplitWrap');
  if (!LEAGUE_SIZES.includes(n)) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const opts = splitOptions(n);
  if (!opts.some(o => splitKey(o) === splitKey(draft.split))) draft.split = opts[0];
  draft.split = opts.find(o => splitKey(o) === splitKey(draft.split));
  $('nlSplits').innerHTML = opts.map((o, i) => `<label class="split">
      <input type="radio" name="nlSplit" id="nlSplit${i}" value="${splitKey(o)}"${splitKey(o) === splitKey(draft.split) ? ' checked' : ''}>
      <span>${splitLabel(o)}</span>
    </label>`).join('');
  renderGroupNames();
}

function renderGroupNames() {
  const { c, d } = draft.split;
  const box = $('nlGroupNames');
  if (!c && !d) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  for (let i = 0; i < c; i++) if (draft.confNames[i] == null) draft.confNames[i] = CONF_NAMES[c][i];
  const totalDivs = d * Math.max(c, 1);
  for (let i = 0; i < totalDivs; i++) if (draft.divNames[i] == null) draft.divNames[i] = DIV_NAMES[i] || `Division ${i + 1}`;
  const divInputs = (from, count) => Array.from({ length: count }, (_, k) => {
    const i = from + k;
    return `<label class="field"><span class="sr">Division ${i + 1} name</span>
      <input id="nlDiv${i}" type="text" maxlength="24" autocomplete="off" value="${esc(draft.divNames[i])}" data-div="${i}"></label>`;
  }).join('');
  let html = '';
  if (c) {
    html = Array.from({ length: c }, (_, ci) => `<div class="gname">
        <label class="field"><span class="field-label">Conference ${ci + 1}</span>
          <input id="nlConf${ci}" type="text" maxlength="24" autocomplete="off" value="${esc(draft.confNames[ci])}" data-conf="${ci}"></label>
        ${d ? `<div class="gname-divs"><span class="field-label muted">Divisions</span>${divInputs(ci * d, d)}</div>` : ''}
      </div>`).join('');
  } else {
    html = `<div class="gname"><span class="field-label">Division names</span><div class="gname-divs gname-divs-flat">${divInputs(0, d)}</div></div>`;
  }
  box.innerHTML = `<p class="field-label">Names</p><div class="gnames">${html}</div>`;
}

$('nlSplits').addEventListener('change', e => {
  const opt = splitOptions(Number($('nlPlayers').value)).find(o => splitKey(o) === e.target.value);
  if (opt) draft.split = opt;
  renderGroupNames();
  renderGameChoices();
  updateStep1Hint();
});
$('nlGroupNames').addEventListener('input', e => {
  if (e.target.dataset.conf != null) draft.confNames[Number(e.target.dataset.conf)] = e.target.value;
  if (e.target.dataset.div != null) draft.divNames[Number(e.target.dataset.div)] = e.target.value;
  showError('nlError', '');
});

function checkGroupNames() {
  const { c, d } = draft.split;
  const confs = draft.confNames.slice(0, c).map(x => (x || '').trim());
  const divs = draft.divNames.slice(0, d * Math.max(c, 1)).map(x => (x || '').trim());
  if (confs.some(x => !x)) return 'Every conference needs a name.';
  if (divs.some(x => !x)) return 'Every division needs a name.';
  const dup = list => list.find((x, i) => list.findIndex(y => y.toLowerCase() === x.toLowerCase()) !== i);
  if (dup(confs)) return `Two conferences are both called ${dup(confs)}. Give each one its own name.`;
  if (dup(divs)) return `Two divisions are both called ${dup(divs)}. Give each one its own name.`;
  return '';
}

function readStep1() {
  const name = $('nlName').value.trim();
  const n = Number($('nlPlayers').value);
  if (!LEAGUE_SIZES.includes(n)) return { error: `Pick a league size: ${LEAGUE_SIZES.join(', ')} players.` };
  const formats = formatsFor(n, draft.split);
  const format = formats ? formats[Number($('nlGamesPick').value) || 0] : null;
  const g = format ? formatGames(n, draft.split, format) : Number($('nlGames').value);
  if (!Number.isInteger(g) || g < 1 || g > 200) return { error: 'Games per player must be a whole number from 1 to 200.' };
  if ((n * g) % 2) return { error: `With ${n} players, games per player must be even so everyone gets the same number. Try ${g - 1} or ${g + 1}.` };
  if (!name) return { error: 'Give the league a name.', n, g, format, nameMissing: true };
  return { name, n, g, format };
}

function updateStep1Hint() {
  const s = readStep1();
  if (s.error && !s.nameMissing) { $('nlHint').textContent = ''; return; }
  const total = (s.n * s.g) / 2;
  const times = s.g / (s.n - 1);
  const vsEach = !s.format && Number.isInteger(times) ? ` Everyone plays everyone ${timesText(times)}.` : '';
  $('nlHint').textContent = `${total} games in all.${vsEach}`;
}

function showError(id, msg) {
  $(id).textContent = msg || '';
  $(id).hidden = !msg;
}

function playerRow(i) {
  const p = draft.players[i] || { name: '', short: '', skill: 3, shortTouched: false };
  draft.players[i] = p;
  const groups = draftGroups();
  const shortShown = p.shortTouched ? p.short : autoShort(p.name || `Player ${i + 1}`);
  return `<div class="prow" data-i="${i}">
    <span class="prow-num">${i + 1}</span>
    <label class="prow-field prow-name">
      <span class="sr">Player ${i + 1} name</span>
      <input id="nlN${i}" type="text" maxlength="30" autocomplete="off" placeholder="Player ${i + 1}" value="${esc(p.name)}" data-k="name">
    </label>
    <label class="prow-field prow-short">
      <span class="sr">Player ${i + 1} initials</span>
      <input id="nlS${i}" type="text" maxlength="4" autocomplete="off" value="${esc(shortShown)}" data-k="short">
    </label>
    <label class="prow-field prow-skill">
      <span class="sr">Player ${i + 1} skill</span>
      <select id="nlK${i}" data-k="skill">
        ${SKILLS.map(k => `<option value="${k}"${k === p.skill ? ' selected' : ''}>Skill ${k}${k === 1 ? ' · best' : k === 5 ? ' · lowest' : ''}</option>`).join('')}
      </select>
    </label>
    ${groups.length ? `<label class="prow-field prow-group">
      <span class="sr">Player ${i + 1} group</span>
      <select id="nlG${i}" data-k="group">
        ${groups.map((g, gi) => `<option value="${gi}"${gi === p.group ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}
      </select>
    </label>` : ''}
  </div>`;
}

function showStep(n) {
  $('newStep1').hidden = n !== 1;
  $('newStep2').hidden = n !== 2;
  $('nlStepLabel').textContent = `Step ${n} of 2`;
  window.scrollTo(0, 0);
}

function startNewLeague() {
  draft.players = [];
  draft.split = { c: -1, d: -1, size: 0 }; // nothing picked yet, so the first option is used
  draft.confNames = [];
  draft.divNames = [];
  draft.groupsFor = '';
  $('newStep1').reset();
  $('nlName').value = '';
  showError('nlError', '');
  showError('nlError2', '');
  renderSplits();
  renderGameChoices();
  updateStep1Hint();
  showStep(1);
}

['nlName', 'nlPlayers', 'nlGames', 'nlGamesPick'].forEach(id => $(id).addEventListener(id === 'nlPlayers' || id === 'nlGamesPick' ? 'change' : 'input', () => {
  showError('nlError', '');
  if (id === 'nlPlayers') { renderSplits(); renderGameChoices(); }
  updateStep1Hint();
}));

$('newStep1').addEventListener('submit', e => {
  e.preventDefault();
  const s = readStep1();
  if (s.error) { showError('nlError', s.error); return; }
  const nameErr = checkGroupNames();
  if (nameErr) { showError('nlError', nameErr); return; }
  draft.players.length = Math.min(draft.players.length, s.n);
  // New split or player count: spread players evenly over the groups, in order.
  const groupsFor = `${s.n}:${splitKey(draft.split)}`;
  if (draft.groupsFor !== groupsFor) {
    draft.groupsFor = groupsFor;
    for (let i = 0; i < s.n; i++) {
      draft.players[i] = draft.players[i] || { name: '', short: '', skill: 3, shortTouched: false };
      draft.players[i].group = draft.split.size ? Math.floor(i / draft.split.size) : null;
    }
  }
  $('nlRows').innerHTML = Array.from({ length: s.n }, (_, i) => playerRow(i)).join('');
  $('newStep2').classList.toggle('has-groups', draftGroups().length > 0);
  $('nlGroupHead').textContent = draft.split.d ? 'Division' : 'Conference';
  $('nlStep2Title').textContent = `${s.n} players in ${s.name}`;
  showStep(2);
  $('nlN0').focus();
});

$('nlRows').addEventListener('input', e => {
  const row = e.target.closest('.prow');
  if (!row) return;
  const i = Number(row.dataset.i);
  const p = draft.players[i];
  const k = e.target.dataset.k;
  showError('nlError2', '');
  if (k === 'name') {
    p.name = e.target.value;
    if (!p.shortTouched) $('nlS' + i).value = autoShort(p.name.trim() || `Player ${i + 1}`);
  } else if (k === 'short') {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    p.short = e.target.value;
    p.shortTouched = p.short !== '';
  } else if (k === 'skill') {
    p.skill = Number(e.target.value);
  } else if (k === 'group') {
    p.group = Number(e.target.value);
  }
});

$('nlBack').addEventListener('click', () => showStep(1));

$('newStep2').addEventListener('submit', e => {
  e.preventDefault();
  const s = readStep1();
  if (s.error) { showStep(1); showError('nlError', s.error); return; }
  const players = Array.from({ length: s.n }, (_, i) => {
    const name = ($('nlN' + i).value.trim()) || `Player ${i + 1}`;
    const short = $('nlS' + i).value.trim().toUpperCase() || autoShort(name);
    return { id: i, name, short, skill: Number($('nlK' + i).value) };
  });
  const seen = {};
  for (const p of players) {
    if (seen[p.short]) {
      showError('nlError2', `${seen[p.short]} and ${p.name} both have the initials ${p.short}. Give one of them different initials.`);
      return;
    }
    seen[p.short] = p.name;
  }
  const { c, d } = draft.split;
  const conferences = draft.confNames.slice(0, c).map(x => x.trim());
  const divisions = [];
  if (d) for (let ci = 0; ci < Math.max(c, 1); ci++) for (let di = 0; di < d; di++) {
    divisions.push({ name: draft.divNames[c ? ci * d + di : di].trim(), conf: c ? ci : null });
  }
  for (const p of players) {
    const gi = d || c ? Number($('nlG' + p.id).value) : null;
    p.div = d ? gi : null;
    p.conf = d ? divisions[gi].conf : c ? gi : null;
  }
  // With a game format, every conference and division must be full, so everyone gets the same schedule.
  if (s.format && (c || d)) {
    const groups = d
      ? divisions.map((dv, gi) => ({ name: dv.name, size: divSize(s.n, draft.split), count: players.filter(p => p.div === gi).length }))
      : conferences.map((cf, gi) => ({ name: cf, size: confSize(s.n, draft.split), count: players.filter(p => p.conf === gi).length }));
    const off = groups.find(g => g.count !== g.size);
    if (off) {
      showError('nlError2', `${off.name} has ${off.count} players but needs ${off.size}, so everyone gets the same schedule. Move players until each ${d ? 'division' : 'conference'} has ${off.size}.`);
      return;
    }
  }
  const groupCount = d ? divisions.length : c;
  for (let gi = 0; gi < groupCount; gi++) {
    if (!players.some(p => (d ? p.div : p.conf) === gi)) {
      showError('nlError2', `${d ? divisions[gi].name : conferences[gi]} has no players. Move at least one player into it.`);
      return;
    }
  }
  const now = new Date().toISOString();
  const lg = {
    id: 'lg-' + Date.now().toString(36),
    name: s.name, mode: '1v1', gamesPerPlayer: s.g, players, conferences, divisions,
    games: s.format
      ? makePairSchedule(s.n, (a, b) => formatTimes({ players, conferences }, s.format, a, b))
      : makeSchedule(s.n, s.g),
    format: s.format || null,
    createdAt: now, lastPlayed: now,
  };
  if (!saveLeague(lg)) {
    showError('nlError2', 'This browser blocked saving, so the league could not be kept. Check that the site is allowed to store data, then try again.');
    return;
  }
  openLeague(lg);
});

// ---------- Standings ----------
let standView = 'conf';
try { standView = localStorage.getItem('dl-stand-view') || 'conf'; } catch (e) { /* storage blocked */ }

function standingsTable(lg, title, sub, ranked, marks, withCutLines) {
  const confs = hasConfs(lg), divs = hasDivs(lg);
  const cols = [['#', 'l'], ['Player', 'l'], ['W'], ['L'], ['PCT'], ['GB'], ['Home'], ['Away'],
    ...(divs ? [['Div']] : []), ...(confs ? [['Conf'], ['Inter']] : []), ['PF/G'], ['PA/G'], ['Diff'], ['L10'], ['Strk']];
  const head = '<tr>' + cols.map(([t, c]) => `<th${c ? ` class="${c}"` : ''} scope="col">${t}</th>`).join('') + '</tr>';
  const top = lg.playoffSpots, post = (lg.playoffSpots || 0) + (lg.playInSpots || 0);
  const body = ranked.map((r, i) => {
    const cut = withCutLines ? (i === top - 1 ? ' class="cut"' : i === post - 1 ? ' class="cut2"' : '') : '';
    const m = marks[r.p];
    const chip = m ? ` <span class="mark mark-${m}" title="${MARKS[m]}">${m}</span>` : '';
    const pl = lg.players[r.p];
    const diff = r.gp ? r.diff / r.gp : 0;
    return `<tr${cut}>
      <td class="l seed">${i + 1}</td>
      <th class="l" scope="row"><span class="pname pname-full">${esc(pl.name)}</span><span class="pname pname-short" title="${esc(pl.name)}">${esc(pl.short)}</span>${chip}</th>
      <td class="strong">${r.w}</td><td class="strong">${r.l}</td>
      <td>${fmtPct(r.pct)}</td><td>${r.gb === 0 ? '—' : r.gb.toFixed(1)}</td>
      <td>${rec(r.hw, r.hl)}</td><td>${rec(r.aw, r.al)}</td>
      ${divs ? `<td>${rec(r.dw, r.dl)}</td>` : ''}
      ${confs ? `<td>${rec(r.cw, r.cl)}</td><td>${rec(r.iw, r.il)}</td>` : ''}
      <td>${perGame(r.pf, r.gp)}</td><td>${perGame(r.pa, r.gp)}</td>
      <td class="${diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}">${r.gp ? (diff > 0 ? '+' : '') + diff.toFixed(1) : '—'}</td>
      <td>${rec(r.l10[0], r.l10[1])}</td>
      <td class="${r.streak[0] === 'W' ? 'pos' : r.streak[0] === 'L' ? 'neg' : ''}">${r.streak}</td>
    </tr>`;
  }).join('');
  return `<section class="panel">
    <h2 class="panel-title">${esc(title)}${sub ? ` <span class="panel-sub">${esc(sub)}</span>` : ''}</h2>
    <div class="tscroll"><table class="tbl">${head}${body}</table></div>
  </section>`;
}

function renderStandings() {
  const lg = currentLeague;
  const confs = hasConfs(lg), divs = hasDivs(lg);
  const rows = computeStandings(lg);
  const marks = raceMarks(lg, rows);
  const finals = lg.games.filter(g => g.final);
  const views = [...(confs ? ['conf'] : []), ...(divs ? ['div'] : []), 'league'];
  const view = views.includes(standView) ? standView : views[0];
  const playoffs = Boolean(lg.playoffSpots && confs);

  $('standTabs').hidden = views.length < 2;
  document.querySelectorAll('#standTabs button').forEach(b => { b.hidden = !views.includes(b.dataset.view); });
  $('standLegend').hidden = !playoffs;
  $('standCutNote').hidden = !playoffs;
  $('standSample').hidden = !lg.sample;
  document.querySelectorAll('#standTabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  $('standLeague').textContent = lg.name;
  $('standMeta').textContent = finals.length
    ? `Through day ${Math.max(...finals.map(g => g.day))} · ${finals.length} of ${lg.games.length} games played`
    : `Not started · ${lg.games.length} games on the schedule`;

  let html;
  if (view === 'conf') {
    html = lg.conferences.map((c, ci) =>
      standingsTable(lg, `${c} Conference`, '', rankGroup(lg, rows, playersInConf(lg, ci)), marks, playoffs)).join('');
  } else if (view === 'div') {
    html = lg.divisions.map((d, di) =>
      standingsTable(lg, `${d.name} Division`, confs ? lg.conferences[d.conf] : '', rankGroup(lg, rows, playersInDiv(lg, di)), marks, false)).join('');
  } else {
    html = standingsTable(lg, views.length > 1 ? 'Whole League' : lg.name, '', rankGroup(lg, rows, allIds(lg)), marks, false);
  }
  $('standTables').innerHTML = html;
}

$('standTabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  standView = b.dataset.view;
  try { localStorage.setItem('dl-stand-view', standView); } catch (err) { /* storage blocked */ }
  renderStandings();
});

// ---------- Page switching ----------
// Pages that aren't built yet show a "Coming soon" page.
const COMING = {
  'quick-game': { title: 'Quick Game', text: 'Two players, one game.' },
  'tournament': { title: 'Tournament', text: 'A knockout bracket with one winner.' },
  'practice': { title: 'Practice', text: 'Roll against the computer to learn the rules.' },
  '2v2': { title: '2 vs 2', text: 'Teams of two.' },
  '3v3': { title: '3 vs 3', text: 'Teams of three.' },
  '4v4': { title: '4 vs 4', text: 'Teams of four.' },
  '5v5': { title: '5 vs 5', text: 'Full teams of five.' },
};
const VIEWS = { '1v1': '1v1', 'new-league': 'new', 'standings': 'standings' };
const TITLES = { '1v1': '1 vs 1', new: 'New league', standings: 'Standings' };

function showPage() {
  const key = location.hash.slice(1);
  const view = VIEWS[key] || (COMING[key] ? 'page' : 'home');
  for (const v of ['home', '1v1', 'new', 'standings', 'page']) $('view-' + v).hidden = v !== view;

  if (view === 'standings') {
    currentLeague = findLeague(currentLeague.id) || byLastPlayed()[0];
    renderStandings();
  } else if (view === '1v1') {
    selectedLeague = byLastPlayed()[0]; // start on the league played last
    renderSavedLeagues();
  } else if (view === 'new') {
    startNewLeague();
  } else if (view === 'page') {
    $('pageTitle').textContent = COMING[key].title;
    $('pageText').textContent = COMING[key].text;
  }
  const title = view === 'page' ? COMING[key].title : TITLES[view];
  document.title = title ? `${title} · Dice League` : 'Dice League';
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', showPage);
showPage();

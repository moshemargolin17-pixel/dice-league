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
  { id: 'sample-dice-league', name: 'Dice League', seed: 2026, playedShare: 0.6, lastPlayed: '2026-11-21T21:00:00.000Z', dice: 5 },
  { id: 'sample-friday-night', name: 'Friday Night League', seed: 77, playedShare: 0.2, lastPlayed: '2026-11-14T22:30:00.000Z' },
  { id: 'sample-summer', name: 'Summer League', seed: 413, playedShare: 1, lastPlayed: '2026-08-30T19:15:00.000Z' },
].map(makeSampleLeague);

const myLeagues = () => Saved.leagues; // see cloud.js: the account's leagues, or this browser's
const allLeagues = () => [...myLeagues(), ...SAMPLE_LEAGUES];
const findLeague = id => allLeagues().find(lg => lg.id === id);

// Saves a league to the account (or this browser). Resolves when saved; rejects if it couldn't be.
const saveLeague = lg => Saved.saveLeague(lg);

const lastPlayedOf = lg => Saved.lastPlayed[lg.id] || lg.lastPlayed;
function markPlayed(lg) {
  Saved.lastPlayed[lg.id] = new Date().toISOString();
  Saved.saveLastPlayed().catch(e => console.error(e));
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
  homeDay = null;
  if (location.hash === '#league') showPage(); else location.hash = 'league';
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

// Playoff choices depend on how many players are in each conference.
function renderPlayoffChoices() {
  const n = Number($('nlPlayers').value);
  if (!LEAGUE_SIZES.includes(n) || draft.split.c < 0) return;
  const size = confSize(n, draft.split);
  const choices = PLAYOFF_CHOICES[size] || [];
  const keep = Number($('nlPlayoffs').value);
  const pick = choices.includes(keep) ? keep : choices[0];
  $('nlPlayoffs').innerHTML = choices.map(k => `<option value="${k}"${k === pick ? ' selected' : ''}>${
    k === 4 ? 'Top 4 make it' : k === 6 ? 'Top 6 make it · 1 and 2 get a bye' : 'Top 8 make it'}</option>`).join('');
  const canPlayIn = PLAY_IN_SIZES.includes(size) && pick === 8;
  $('nlPlayInWrap').hidden = !canPlayIn;
  if (!canPlayIn) $('nlPlayIn').checked = false;
}
['nlPlayoffs', 'nlPlayIn'].forEach(id => $(id).addEventListener('change', renderPlayoffChoices));

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
  renderPlayoffChoices();
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
  const spots = Number($('nlPlayoffs').value);
  const playoffs = spots ? { spots, playIn: spots === 8 && !$('nlPlayInWrap').hidden && $('nlPlayIn').checked } : null;
  if (!name) return { error: 'Give the league a name.', n, g, format, nameMissing: true };
  return { name, n, g, format, playoffs, dice: Number($('nlDice').value) === 5 ? 5 : 3 };
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
  const p = draft.players[i] || { name: '', short: '', skill: 2, shortTouched: false };
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
        ${SKILLS.slice().reverse().map(k => `<option value="${k}" aria-label="${starLabel(k)}"${k === p.skill ? ' selected' : ''}>${starText(k)}</option>`).join('')}
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
  renderPlayoffChoices();
  updateStep1Hint();
  showStep(1);
}

['nlName', 'nlPlayers', 'nlGames', 'nlGamesPick'].forEach(id => $(id).addEventListener(id === 'nlPlayers' || id === 'nlGamesPick' ? 'change' : 'input', () => {
  showError('nlError', '');
  if (id === 'nlPlayers') { renderSplits(); renderGameChoices(); renderPlayoffChoices(); }
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
      draft.players[i] = draft.players[i] || { name: '', short: '', skill: 2, shortTouched: false };
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
      : makePairSchedule(s.n, () => Math.max(1, Math.round(s.g / (s.n - 1)))),
    format: s.format || null,
    playoffs: s.playoffs,
    dice: s.dice,
    createdAt: now, lastPlayed: now,
  };
  const btn = e.submitter;
  if (btn) btn.disabled = true;
  saveLeague(lg)
    .then(() => openLeague(lg))
    .catch(err => {
      console.error(err);
      showError('nlError2', Saved.mode === 'cloud'
        ? 'The league couldn’t be saved to your account. Check your internet connection, then press Create league again.'
        : 'This browser blocked saving, so the league could not be kept. Check that the site is allowed to store data, then try again.');
    })
    .finally(() => { if (btn) btn.disabled = false; });
});

// ---------- Standings ----------
let standView = 'conf';
try { standView = localStorage.getItem('dl-stand-view') || 'conf'; } catch (e) { /* storage blocked */ }

function standingsTable(lg, title, sub, ranked, marks, withCutLines) {
  const confs = hasConfs(lg), divs = hasDivs(lg);
  const cols = [['#', 'l'], ['Player', 'l'], ['W'], ['L'], ['PCT'], ['GB'], ['Home'], ['Away'],
    ...(divs ? [['Div']] : []), ...(confs ? [['Conf'], ['Inter']] : []), ['PF/G'], ['PA/G'], ['Diff'], ['L10'], ['Strk']];
  const head = '<tr>' + cols.map(([t, c]) => `<th${c ? ` class="${c}"` : ''} scope="col">${t}</th>`).join('') + '</tr>';
  const lines = playoffLines(lg) || { direct: 0, post: 0 };
  const texts = markText(lg);
  const body = ranked.map((r, i) => {
    const cut = withCutLines ? (i === lines.direct - 1 ? ' class="cut"' : i === lines.post - 1 ? ' class="cut2"' : '') : '';
    const m = marks[r.p];
    const chip = m ? ` <span class="mark mark-${m}" title="${texts[m]}">${m}</span>` : '';
    const pl = lg.players[r.p];
    const diff = r.gp ? r.diff / r.gp : 0;
    return `<tr${cut}>
      <td class="l seed">${i + 1}</td>
      <th class="l" scope="row"><a class="pname pname-full plink" href="#player-${r.p}">${esc(pl.name)}</a><span class="pname pname-short" title="${esc(pl.name)}">${esc(pl.short)}</span>${chip}</th>
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

// The bracket as it would be if the season ended today.
function confRounds(lines, finalName) {
  const W = (a, b) => `Winner ${a}–${b}`;
  const bo = SERIES_LENGTHS[lines.spots];
  if (lines.spots === 4) {
    return [
      { name: 'Semifinals', bestOf: bo[0], games: [[1, 4], [2, 3]] },
      { name: finalName, bestOf: bo[1], games: [[W(1, 4), W(2, 3)]] },
    ];
  }
  if (lines.spots === 6) {
    return [
      { name: 'Wild card', bestOf: bo[0], games: [[3, 6], [4, 5]] },
      { name: 'Semifinals', bestOf: bo[1], games: [[1, W(4, 5)], [2, W(3, 6)]] },
      { name: finalName, bestOf: bo[2], games: [['Semifinal winner', 'Semifinal winner']] },
    ];
  }
  return [
    ...(lines.playIn ? [{ name: 'Play-in', bestOf: 1, games: [[7, 8], [9, 10], ['Loser 7–8', 'Winner 9–10']] }] : []),
    { name: 'First round', bestOf: bo[0], games: [[1, 8], [4, 5], [2, 7], [3, 6]] },
    { name: 'Semifinals', bestOf: bo[1], games: [[W(1, 8), W(4, 5)], [W(2, 7), W(3, 6)]] },
    { name: finalName, bestOf: bo[2], games: [['Semifinal winner', 'Semifinal winner']] },
  ];
}

// Bracket page: the postseason bracket, once the regular season is over.
function renderBracketPage(lg) {
  const lines = playoffLines(lg);
  if (!seasonDone(lg) || !lines) { location.hash = 'standings'; return; }
  const ps = postState(lg), post = ps.post;
  const seedOf = p => { for (const g of ps.seeds) { const i = g.indexOf(p); if (i >= 0) return i + 1; } return ''; };
  const slot = (s, isHi) => {
    const p = isHi ? s.hi : s.lo, wins = isHi ? s.wh : s.wl;
    const cls = s.done ? (p === s.winner ? ' bk-win' : ' bk-out') : '';
    if (p == null) return `<span class="bk-slot bk-tbd">${esc(slotInfo(lg, post, isHi ? s.x.hi : s.x.lo, ps.seeds).text)}</span>`;
    return `<span class="bk-slot${cls}"><span class="bk-seed">${seedOf(p)}</span><a class="plink" href="#player-${p}" title="${esc(lg.players[p].name)}">${esc(lg.players[p].name)}</a>${s.x.bestOf > 1 || s.done ? `<b class="bk-w">${wins}</b>` : ''}</span>`;
  };
  const note = s => {
    if (s.done) return s.x.bestOf > 1 ? `${esc(lg.players[s.winner].name)} wins ${Math.max(s.wh, s.wl)}–${Math.min(s.wh, s.wl)}` : `${esc(lg.players[s.winner].name)} wins`;
    if (s.next) {
      const lead = s.wh === s.wl ? (s.wh ? `Tied ${s.wh}–${s.wl} · ` : '') : `${esc(lg.players[s.wh > s.wl ? s.hi : s.lo].name)} leads ${Math.max(s.wh, s.wl)}–${Math.min(s.wh, s.wl)} · `;
      return `${lead}Game ${s.next.no} on Day ${s.next.day}`;
    }
    return `Starts Day ${s.x.firstDay}`;
  };
  const box = s => `<div class="bk-game">${slot(s, true)}${slot(s, false)}<span class="bk-note">${note(s)}</span></div>`;
  const block = (title, conf) => {
    const xs = post.series.filter(x => x.conf === conf);
    const rounds = [...new Set(xs.map(x => x.round))];
    return `<div class="bk-conf">${title ? `<h3 class="bk-title">${esc(title)}</h3>` : ''}
      <div class="bk-rounds">${rounds.map(rd => {
        const rs = xs.filter(x => x.round === rd);
        const a = Math.min(...rs.map(x => x.firstDay)), b = Math.max(...rs.map(x => x.lastDay));
        return `<div class="bk-round"><p class="bk-name">${esc(rd)} <span class="bk-bo">${boText(rs[0].bestOf)} · ${a === b ? `Day ${a}` : `Days ${a}–${b}`}</span></p>
          ${rs.map(x => box(ps.series[x.id])).join('')}</div>`;
      }).join('')}</div></div>`;
  };
  const blocks = hasConfs(lg)
    ? lg.conferences.map((c, ci) => block(`${c} Conference`, ci)).join('') + block('Finals', null)
    : block('', null);
  $('lgBracket').innerHTML = `<section class="panel bk">
    <h2 class="panel-title">Bracket</h2>
    ${ps.champion != null ? `<p class="bk-champ">Champion: <b>${esc(lg.players[ps.champion].name)}</b></p>` : ''}
    ${blocks}
  </section>`;
}

function playoffPicture(lg, rows, lines) {
  const confs = hasConfs(lg);
  const side = (x, seeds, firstRound) => {
    if (typeof x !== 'number') return `<span class="bk-slot bk-tbd">${esc(x)}</span>`;
    const p = seeds[x - 1];
    const viaPlayIn = lines.playIn && firstRound && (x === 7 || x === 8);
    const pl = lg.players[p];
    return `<span class="bk-slot"><span class="bk-seed">${x}</span>${viaPlayIn ? '<span class="bk-tbd">Play-in</span>' : `<span title="${esc(pl.name)}">${esc(pl.short)}</span>`}</span>`;
  };
  const post = postOf(lg);
  // Days a round runs, from the postseason schedule. The play-in has two stages; both are shown.
  const roundDays = (name, conf) => {
    const xs = post.series.filter(x => x.round === name && x.conf === conf);
    if (!xs.length) return '';
    const a = Math.min(...xs.map(x => x.firstDay)), b = Math.max(...xs.map(x => x.lastDay));
    return a === b ? ` · Day ${a}` : ` · Days ${a}–${b}`;
  };
  const block = (title, seeds, conf) => {
    const rounds = confRounds(lines, confs ? 'Conference final' : 'Final');
    return `<div class="bk-conf">
      ${title ? `<h3 class="bk-title">${esc(title)}</h3>` : ''}
      <div class="bk-rounds">${rounds.map(rd => `<div class="bk-round">
        <p class="bk-name">${rd.name} <span class="bk-bo">${boText(rd.bestOf)}${roundDays(rd.name, conf)}</span></p>
        ${rd.games.map(([a, b]) => `<div class="bk-game">${side(a, seeds, rd.name === 'First round')}${side(b, seeds, rd.name === 'First round')}</div>`).join('')}
      </div>`).join('')}</div>
    </div>`;
  };
  const groups = seedGroups(lg).map(ids => seedOrder(lg, rows, ids).map(r => r.p));
  const blocks = confs
    ? lg.conferences.map((c, ci) => block(`${c} Conference`, groups[ci], ci)).join('') +
      `<div class="bk-conf"><h3 class="bk-title">Finals <span class="bk-bo">${boText(FINALS_LENGTH)}${roundDays('Finals', null)}</span></h3><div class="bk-rounds"><div class="bk-round"><div class="bk-game">
        <span class="bk-slot bk-tbd">${esc(lg.conferences[0])} champion</span><span class="bk-slot bk-tbd">${esc(lg.conferences[1])} champion</span>
      </div></div></div></div>`
    : block('', groups[0], null);
  return `<section class="panel bk">
    <h2 class="panel-title">${seasonDone(lg) ? 'Bracket' : 'Playoff picture <span class="panel-sub">If the season ended today</span>'}</h2>
    ${blocks}
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
  const lines = playoffLines(lg);

  $('standTabs').hidden = views.length < 2;
  document.querySelectorAll('#standTabs button').forEach(b => { b.hidden = !views.includes(b.dataset.view); });
  $('standLegend').hidden = !lines;
  $('standCutNote').hidden = !lines;
  if (lines) {
    const t = markText(lg);
    $('standLegend').innerHTML = ['z', ...(divisionSeeding(lg) ? ['y'] : []), 'X', ...(lines.playIn ? ['PI', 'PS'] : []), 'E']
      .map(k => `<span><span class="mark mark-${k}">${k}</span>${t[k]}</span>`).join('');
    $('standCutNote').textContent = (lines.playIn
      ? `A solid line falls under the ${lines.direct}th seed (playoffs) and a dashed line under the 10th (play-in).`
      : `A solid line falls under the last playoff seed (${lines.direct}).`) +
      (divisionSeeding(lg) ? ' Division winners are seeded 1 to 3 even if someone else has a better record.' : '') +
      ' Ties are broken by head-to-head record, then division or conference record, then point differential.';
  }
  $('standSample').hidden = !lg.sample;
  document.querySelectorAll('#standTabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  $('standMeta').textContent = finals.length
    ? `Through day ${Math.max(...finals.map(g => g.day))} · ${finals.length} of ${lg.games.length} games played`
    : `Not started · ${lg.games.length} games on the schedule`;

  let html;
  if (view === 'conf') {
    html = lg.conferences.map((c, ci) =>
      standingsTable(lg, `${c} Conference`, '', seedOrder(lg, rows, playersInConf(lg, ci)), marks, Boolean(lines))).join('');
  } else if (view === 'div') {
    html = lg.divisions.map((d, di) =>
      standingsTable(lg, `${d.name} Division`, confs ? lg.conferences[d.conf] : '', rankGroup(lg, rows, playersInDiv(lg, di)), marks, false)).join('');
  } else {
    const seeded = Boolean(lines) && !confs;
    html = standingsTable(lg, views.length > 1 ? 'Whole League' : lg.name, '', (seeded ? seedOrder : rankGroup)(lg, rows, allIds(lg)), marks, seeded);
  }
  // The playoff picture shows once three quarters of the regular season is played (and through the postseason).
  const played = lg.games.filter(g => g.final).length;
  const showPicture = lines && lg.games.length && played >= lg.games.length * 0.75 && !seasonDone(lg);
  $('standTables').innerHTML = html + (showPicture ? playoffPicture(lg, rows, lines) : '');
}

$('standTabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  standView = b.dataset.view;
  try { localStorage.setItem('dl-stand-view', standView); } catch (err) { /* storage blocked */ }
  renderStandings();
});

// ---------- League home ----------
// The day shown on the league home. null means today: the first day that still has unplayed games.
let homeDay = null;

const seasonDays = lg => Math.max(1, ...lg.games.map(g => g.day)); // last day of the regular season
const seasonDone = lg => lg.games.length > 0 && lg.games.every(g => g.final);

// The postseason schedule, built from seeds (cached per league and schedule).
const postCache = new Map();
function postOf(lg) {
  const key = `${lg.id}:${lg.setupVersion || 0}:${lg.games.length}:${JSON.stringify(lg.playoffs || null)}`;
  if (!postCache.has(key)) postCache.set(key, buildPostseason(lg, seasonDays(lg)));
  return postCache.get(key);
}
const lastDayOf = lg => Math.max(seasonDays(lg), ...postOf(lg).games.map(g => g.day));

// Who fills a postseason slot: a player once seeds are known, otherwise a description.
function slotInfo(lg, post, slot, seeds) {
  const confName = c => (c == null ? '' : lg.conferences[c] + ' ');
  if (slot.seed) {
    const p = seeds ? seeds[slot.conf == null ? 0 : slot.conf][slot.seed - 1] : null;
    return p != null ? { p, text: lg.players[p].name, seed: slot.seed } : { text: `${confName(slot.conf)}${slot.seed} seed`, seed: slot.seed };
  }
  const x = post.series.find(z => z.id === (slot.winnerOf || slot.loserOf));
  if (slot.winnerOf && /final$/i.test(x.round) && x.round !== 'Finals' && x.conf != null) return { text: `${lg.conferences[x.conf]} champion` };
  const what = x.round === 'Play-in' ? `play-in ${x.short}` : x.round === 'Wild card' || x.round === 'First round' ? x.short : `${x.round.toLowerCase()} ${x.short}`;
  return { text: `${slot.winnerOf ? 'Winner' : 'Loser'} of ${confName(x.conf)}${what}`.replace('of the', 'of') };
}

function seedsIfKnown(lg) {
  if (!seasonDone(lg) || !playoffLines(lg)) return null;
  const rows = computeStandings(lg);
  return seedGroups(lg).map(ids => seedOrder(lg, rows, ids).map(r => r.p));
}

// ---------- Postseason results ----------
// lg.postResults: { [postseason game id]: { away, home, log, final, awayPts, homePts } }.
// Each series' players come from the seeds and the series before it; a series is over once someone
// has the wins it needs, and its later games aren't needed.
function postState(lg) {
  const post = postOf(lg), seeds = seedsIfKnown(lg), res = lg.postResults || {};
  const memo = {};
  let rows = null;
  const better = (a, b) => {
    const g = seeds.find(ids => ids.includes(a) && ids.includes(b));
    if (g) return g.indexOf(a) < g.indexOf(b);
    rows = rows || computeStandings(lg);
    const order = rankGroup(lg, rows, [a, b]);
    return order[0].p === a;
  };
  const resolve = slot => {
    if (slot.seed) return seeds ? seeds[slot.conf == null ? 0 : slot.conf][slot.seed - 1] : null;
    const s = st(slot.winnerOf || slot.loserOf);
    return slot.winnerOf ? s.winner : s.loser;
  };
  const st = id => {
    if (memo[id]) return memo[id];
    const x = post.series.find(z => z.id === id);
    let hi = resolve(x.hi), lo = resolve(x.lo);
    // the better seed has home court (between conferences, the better regular-season record)
    if (hi != null && lo != null && better(lo, hi)) [hi, lo] = [lo, hi];
    const need = Math.ceil(x.bestOf / 2);
    const games = post.games.filter(g => g.series === id).sort((a, b) => a.no - b.no);
    let wh = 0, wl = 0, played = 0;
    for (const g of games) {
      const r = res[g.id];
      if (!r || !r.final) continue;
      played++;
      if ((r.homePts > r.awayPts ? r.home : r.away) === hi) wh++; else wl++;
    }
    const known = hi != null && lo != null;
    const done = known && (wh >= need || wl >= need);
    return (memo[id] = {
      x, hi, lo, wh, wl, need, done, games,
      winner: done ? (wh >= need ? hi : lo) : null,
      loser: done ? (wh >= need ? lo : hi) : null,
      next: known && !done ? games[played] : null,   // the series' next game to play
    });
  };
  const series = {};
  post.series.forEach(x => { series[x.id] = st(x.id); });
  const title = post.series.length ? series[post.series[post.series.length - 1].id] : null;   // the last series decides the title
  return { post, seeds, series, champion: title && title.done ? title.winner : null };
}

// A postseason game with its players and result filled in.
function postGameView(lg, ps, g) {
  const s = ps.series[g.series];
  const [away, home] = g.hiHome ? [s.lo, s.hi] : [s.hi, s.lo];
  const r = (lg.postResults || {})[g.id] || {};
  return {
    id: g.id, day: g.day, no: g.no, away, home, s, pg: g,
    log: r.log || [], final: !!r.final, awayPts: r.awayPts, homePts: r.homePts,
    notNeeded: s.done && !r.final,
  };
}
const postStarted = lg => Object.values(lg.postResults || {}).some(r => r.log && r.log.length);

function postGameCard(lg, post, g, seeds, ps) {
  ps = ps || postState(lg);
  const v = postGameView(lg, ps, g), x = v.s.x;
  const started = !v.final && v.log.length > 0;
  const live = started ? playGame(v) : v;
  const slotOf = isHome => (g.hiHome === isHome ? x.hi : x.lo);
  const row = (p, isHome) => {
    const t = p != null ? { p, text: lg.players[p].name } : slotInfo(lg, post, slotOf(isHome), seeds);
    const pts = isHome ? live.homePts : live.awayPts, opp = isHome ? live.awayPts : live.homePts;
    const won = v.final && pts > opp;
    return `<div class="gteam${won ? ' won' : ''}">
      <div class="gc-name"><b class="${t.p == null ? 'tbd' : ''}">${t.p == null ? esc(t.text) : `<a class="plink" href="#player-${t.p}">${esc(t.text)}</a>`}</b><small>${isHome ? 'Home' : 'Away'}</small></div>
      <span class="gsc${v.final ? (won ? ' win' : ' lose') : ''}">${v.final || started ? pts : '–'}</span>
    </div>`;
  };
  const label = `${x.round}${x.bestOf > 1 ? ` · Game ${g.no}` : ''}`;
  const status = v.final ? 'Final' : started ? 'In progress' : v.notNeeded ? 'Not needed' : g.ifNecessary ? 'If necessary' : x.conf != null ? esc(lg.conferences[x.conf]) : '';
  const playable = v.s.next === g && canPlayToday(lg, g.day);
  const link = playable ? `<a class="btn ${started ? 'btn-primary' : 'btn-roll'} btn-sm" href="#game-${g.id}">${started ? 'Continue' : 'Play'}</a>`
    : v.final ? `<a class="btn btn-ghost btn-sm" href="#game-${g.id}">Play-by-play</a>` : '';
  return `<article class="gcard is-post${g.ifNecessary && !v.final && !started ? ' is-maybe' : ''}${v.final ? ' is-final' : ''}${started ? ' is-live' : ''}${v.notNeeded ? ' is-skip' : ''}">
    <div class="gtop"><span class="gst">${esc(label)}</span><span class="gmeta">${status}</span></div>
    <div class="gbody">${row(v.away, false)}${row(v.home, true)}</div>
    ${link ? `<div class="gfoot">${link}</div>` : ''}
  </article>`;
}
// The next day with a game to play: the first day with a regular-season game left, then the first day
// a series has its next game (or the last day played, once everything is done).
function nextGameDay(lg) {
  const open = lg.games.filter(g => !g.final);
  if (open.length) return Math.min(...open.map(g => g.day));
  if (!playoffLines(lg) || !lg.games.length) return seasonDays(lg);
  const ps = postState(lg);
  const next = Object.values(ps.series).map(s => s.next).filter(Boolean);
  if (next.length) return Math.min(...next.map(g => g.day));
  const res = lg.postResults || {};
  const played = ps.post.games.filter(g => res[g.id] && res[g.id].final).map(g => g.day);
  return played.length ? Math.max(...played) : seasonDays(lg);
}

// Today: the league stays on its day until End Day is pressed (lg.curDay), unless a game on an earlier
// day is open again. Leagues from before Start/End Day just use the next day with a game.
function todayOf(lg) {
  const next = nextGameDay(lg);
  return lg.curDay != null ? Math.min(lg.curDay, next) : next;
}
const gamesOnDay = (lg, day) => lg.games.filter(g => g.day === day);
// Games can be played once the day is started (a game already under way counts as started).
function dayStarted(lg) {
  const today = todayOf(lg);
  if (lg.startedDay === today) return true;
  if (gamesOnDay(lg, today).some(g => !g.final && g.log && g.log.length)) return true;
  const res = lg.postResults || {};
  return postOf(lg).games.some(g => g.day === today && res[g.id] && !res[g.id].final);
}
// Every game today is final (or, in the postseason, not needed).
function dayFinished(lg) {
  const today = todayOf(lg);
  if (gamesOnDay(lg, today).some(g => !g.final)) return false;
  if (lg.games.every(g => g.final) && playoffLines(lg) && lg.games.length) {
    if (Object.values(postState(lg).series).some(s => s.next && s.next.day === today)) return false;
  }
  return true;
}
const seasonOver = lg => Boolean(lg.seasonEnded);
const canPlayToday = (lg, day) => day === todayOf(lg) && dayStarted(lg) && !seasonOver(lg);

function startDay(lg) {
  lg.curDay = todayOf(lg);
  lg.startedDay = lg.curDay;
  saveDay(lg);
}
function endDay(lg) {
  const today = todayOf(lg);
  const next = nextGameDay(lg);
  lg.startedDay = null;
  if (next > today) lg.curDay = next;
  else { lg.curDay = today; lg.seasonEnded = true; }   // nothing left to play
  homeDay = null;
  saveDay(lg);
}
function saveDay(lg) {
  if (!lg.sample) saveLeague(lg).catch(e => { console.error(e); alert('That couldn’t be saved. Check your connection and try again.'); });
  renderLeagueHeader(lg, 'home');
  renderLeagueHome();
}

function renderLeagueHeader(lg, tab) {
  $('lgName').textContent = lg.name;
  // "Day X of Y" counts the whole season, playoffs included.
  const champ = seasonDone(lg) && playoffLines(lg) ? postState(lg).champion : null;
  $('lgSub').textContent = champ != null ? `Season 1 · Champion: ${lg.players[champ].name}` : `Season 1 · Day ${todayOf(lg)} of ${lastDayOf(lg)}`;
  $('tabBracket').hidden = !(seasonDone(lg) && playoffLines(lg));
  document.querySelectorAll('.lgtabs a').forEach(a => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

// A player's record going into a game, or right after it once it's final.
function recordAt(lg, p, g) {
  let w = 0, l = 0, hw = 0, hl = 0, aw = 0, al = 0;
  for (const x of lg.games) {
    if (!x.final || (x.away !== p && x.home !== p)) continue;
    if (x.day > g.day || (x.day === g.day && x !== g)) continue;
    if (!g.final && x.day >= g.day) continue;
    const won = (x.home === p) === (x.homePts > x.awayPts);
    if (won) w++; else l++;
    if (x.home === p) { if (won) hw++; else hl++; } else if (won) aw++; else al++;
  }
  return { w, l, hw, hl, aw, al };
}

function gameKind(lg, g) {
  if (hasDivs(lg) && divOf(lg, g.away) === divOf(lg, g.home)) return 'Division';
  if (hasConfs(lg)) return confOf(lg, g.away) === confOf(lg, g.home) ? 'Conference' : 'Interconference';
  return '';
}

function gameCard(lg, g) {
  const side = (p, isHome) => {
    const r = recordAt(lg, p, g);
    const pts = isHome ? live.homePts : live.awayPts, opp = isHome ? live.awayPts : live.homePts;
    const won = g.final && pts > opp;
    const where = isHome ? `${rec(r.hw, r.hl)} home` : `${rec(r.aw, r.al)} away`;
    return `<div class="gteam${won ? ' won' : ''}">
      <div class="gc-name"><b><a class="plink" href="#player-${p}">${esc(lg.players[p].name)}</a></b><small>${rec(r.w, r.l)} · ${where}</small></div>
      <span class="gsc${g.final ? (won ? ' win' : ' lose') : ''}">${g.final || started ? pts : '–'}</span>
    </div>`;
  };
  const started = !g.final && g.log && g.log.length > 0;
  const live = started ? playGame(g) : g;
  const link = !g.final && canPlayToday(lg, g.day) ? `<a class="btn ${started ? 'btn-primary' : 'btn-roll'} btn-sm" href="#game-${g.id}">${started ? 'Continue' : 'Play'}</a>`
    : g.final && g.log ? `<a class="btn btn-ghost btn-sm" href="#game-${g.id}">Play-by-play</a>` : '';
  return `<article class="gcard${g.final ? ' is-final' : ''}${started ? ' is-live' : ''}">
    <div class="gtop"><span class="gst">${g.final ? 'Final' : started ? 'In progress' : ''}</span><span class="gmeta">${gameKind(lg, g)}</span></div>
    <div class="gbody">${side(g.away, false)}${side(g.home, true)}</div>
    ${link ? `<div class="gfoot">${link}</div>` : ''}
  </article>`;
}

// Who can clinch something, or be eliminated, depending on how their game goes today.
function scenarios(lg, games) {
  const rows = computeStandings(lg);
  const base = raceMarks(lg, rows);
  if (!Object.keys(base).length) return [];
  const rank = ['z', 'y', 'X', 'PS'];
  const goal = { z: 'clinches the #1 seed', y: 'clinches the division', X: 'clinches a playoff spot', PS: 'clinches a postseason spot' };
  const withResult = (g, p, o, pWins) => {
    const r2 = rows.map(r => ({ ...r }));
    r2[p].left--; r2[o].left--; r2[p].gp++; r2[o].gp++;
    if (pWins) { r2[p].w++; r2[o].l++; } else { r2[p].l++; r2[o].w++; }
    const hp = (r2[p].h2h = { ...r2[p].h2h })[o] = [...(r2[p].h2h[o] || [0, 0])];
    const ho = (r2[o].h2h = { ...r2[o].h2h })[p] = [...(r2[o].h2h[p] || [0, 0])];
    if (pWins) { hp[0]++; ho[1]++; } else { hp[1]++; ho[0]++; }
    return raceMarks(lg, r2, g.id);
  };
  const out = [];
  for (const g of games) {
    if (g.final) continue;
    for (const [p, o] of [[g.away, g.home], [g.home, g.away]]) {
      const name = esc(lg.players[p].name);
      const now = base[p];
      const ifWin = withResult(g, p, o, true)[p];
      if (ifWin && rank.includes(ifWin) && (!rank.includes(now) || rank.indexOf(ifWin) < rank.indexOf(now))) {
        out.push(`<b>${name}</b> ${goal[ifWin]} with a win.`);
      }
      if (now !== 'E' && withResult(g, p, o, false)[p] === 'E') out.push(`<b>${name}</b> is eliminated with a loss.`);
    }
  }
  return out;
}

function renderLeagueHome() {
  const lg = currentLeague;
  const today = todayOf(lg), last = lastDayOf(lg);
  const day = Math.min(Math.max(homeDay == null ? today : homeDay, 1), last);
  const games = lg.games.filter(g => g.day === day).sort((x, y) => x.id - y.id);
  const post = postOf(lg);
  const postGames = post.games.filter(g => g.day === day);
  const nFin = games.filter(g => g.final).length;
  const isToday = day === today;
  const isPost = day > seasonDays(lg);

  $('homeSample').hidden = !lg.sample;
  $('dayTitle').textContent = `Day ${day}${isPost ? ' · Postseason' : ''}`;
  const n = games.length + postGames.length;
  const psDay = postGames.length ? postState(lg) : null;
  const postDone = postGames.filter(g => ((lg.postResults || {})[g.id] || {}).final).length;
  const maybe = postGames.filter(g => g.ifNecessary && !psDay.series[g.series].done).length;
  $('daySummary').textContent = `${n} ${n === 1 ? 'game' : 'games'}${nFin + postDone ? ` · ${nFin + postDone} final` : ''}${maybe ? ` · ${maybe} if necessary` : ''}`;
  $('dayPrev').disabled = day <= 1;
  $('dayNext').disabled = day >= last;
  $('dayToday').disabled = day === today;
  const seeds = postGames.length ? seedsIfKnown(lg) : null;
  const ps = postGames.length ? postState(lg) : null;
  // Start Day / End Day, on today
  const finished = dayFinished(lg), started = dayStarted(lg);
  const hasGames = n > 0;
  $('dayAction').innerHTML = !isToday || seasonOver(lg) || !hasGames ? (seasonOver(lg) && isToday ? '<p class="muted">Season complete</p>' : '')
    : finished ? '<button type="button" class="btn btn-primary" data-day-act="end">End Day</button>'
    : started ? '<p class="muted">Day in progress</p>'
    : '<button type="button" class="btn btn-roll" data-day-act="start">Start Day</button>';
  $('dayGames').innerHTML = games.map(g => gameCard(lg, g)).join('') +
    postGames.map(g => postGameCard(lg, post, g, seeds, ps)).join('') || '<p class="rempty">No games on this day.</p>';

  const sc = isToday && !isPost ? scenarios(lg, games) : [];
  $('dayScen').hidden = !sc.length;
  $('dayScen').innerHTML = sc.length ? `<h2 class="panel-title">On the line today</h2>${sc.map(t => `<p class="scl">${t}</p>`).join('')}` : '';

}

function stepDay(delta) {
  const lg = currentLeague;
  const cur = homeDay == null ? todayOf(lg) : homeDay;
  homeDay = Math.min(Math.max(cur + delta, 1), lastDayOf(lg));
  renderLeagueHome();
}
$('dayPrev').addEventListener('click', () => stepDay(-1));
$('dayNext').addEventListener('click', () => stepDay(1));
$('dayToday').addEventListener('click', () => { homeDay = null; renderLeagueHome(); });
$('dayAction').addEventListener('click', e => {
  const b = e.target.closest('[data-day-act]');
  if (!b) return;
  if (b.dataset.dayAct === 'start') startDay(currentLeague); else endDay(currentLeague);
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
const LEAGUE_TABS = { league: 'home', games: 'games', standings: 'standings', bracket: 'bracket', players: 'players', stats: 'stats', 'league-options': 'settings' };
const VIEWS = { '1v1': '1v1', 'new-league': 'new' };
for (const k of Object.keys(LEAGUE_TABS)) VIEWS[k] = 'league';
const TITLES = { '1v1': '1 vs 1', new: 'New league' };

function showPage() {
  const key = location.hash.slice(1);
  const playerMatch = /^player-(\d+)$/.exec(key);
  const gameMatch = /^game-(\w+)$/.exec(key);
  const view = playerMatch || gameMatch ? 'league' : VIEWS[key] || (COMING[key] ? 'page' : 'home');
  for (const v of ['home', '1v1', 'new', 'league', 'page']) $('view-' + v).hidden = v !== view;

  let title = view === 'page' ? COMING[key].title : TITLES[view];
  if (view === 'league') {
    currentLeague = findLeague(currentLeague.id) || byLastPlayed()[0];
    const lg = currentLeague;
    const tab = playerMatch ? 'players' : gameMatch ? 'home' : LEAGUE_TABS[key];
    const panel = playerMatch ? 'player' : gameMatch ? 'game' : tab;
    renderLeagueHeader(lg, tab);
    const panels = { home: 'lgHome', games: 'lgGames', standings: 'lgStandings', bracket: 'lgBracket', players: 'lgPlayers', player: 'lgPlayer', stats: 'lgStats', settings: 'lgSettings', game: 'lgGame' };
    for (const [k, id] of Object.entries(panels)) $(id).hidden = k !== panel;
    const names = { home: lg.name, games: 'Games', standings: 'Standings', bracket: 'Bracket', players: 'Players', stats: 'Stats', settings: 'Settings' };
    title = names[tab];
    if (panel === 'home') renderLeagueHome();
    else if (panel === 'standings') renderStandings();
    else if (panel === 'games') renderGamesPage(lg);
    else if (panel === 'players') renderPlayersPage(lg);
    else if (panel === 'player') {
      const p = Number(playerMatch[1]);
      if (lg.players[p]) { renderPlayerPage(lg, p); title = lg.players[p].name; } else location.hash = 'players';
    }
    else if (panel === 'stats') renderStatsPage(lg);
    else if (panel === 'bracket') renderBracketPage(lg);
    else if (panel === 'game') { renderGamePage(lg, gameMatch[1]); title = 'Game'; }
    else if (panel === 'settings') renderSettingsPage(lg);
  } else if (view === '1v1') {
    selectedLeague = byLastPlayed()[0]; // start on the league played last
    renderSavedLeagues();
  } else if (view === 'new') {
    startNewLeague();
  } else if (view === 'page') {
    $('pageTitle').textContent = COMING[key].title;
    $('pageText').textContent = COMING[key].text;
  }
  document.title = title ? `${title} · Dice League` : 'Dice League';
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', showPage);
// The first showPage() runs at the end of pages.js, once every page is defined.

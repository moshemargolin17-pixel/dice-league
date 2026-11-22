// Dice League: home page dice tray, standings page and page switching.

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

const dieA = document.getElementById('dieA');
const dieB = document.getElementById('dieB');

drawDie(dieA, Number(dieA.dataset.value));
drawDie(dieB, Number(dieB.dataset.value));

document.getElementById('rollBtn').addEventListener('click', () => {
  const a = rollD6();
  const b = rollD6();
  for (const die of [dieA, dieB]) {
    die.classList.remove('rolling');
    void die.offsetWidth; // restart the animation
    die.classList.add('rolling');
  }
  setTimeout(() => {
    drawDie(dieA, a);
    drawDie(dieB, b);
  }, 220);
});

// ---------- Standings ----------
// ---------- Saved leagues ----------
// For now these are sample leagues. Each has its own made-up season.
// Which league was played last is remembered in this browser.
const SAVED_LEAGUES = [
  { id: 'dice-league', name: 'Dice League', seed: 2026, playedDays: 34, lastPlayed: '2026-11-21T21:00:00' },
  { id: 'friday-night', name: 'Friday Night League', seed: 77, playedDays: 12, lastPlayed: '2026-11-14T22:30:00' },
  { id: 'summer-2026', name: 'Summer League', seed: 413, playedDays: 58, lastPlayed: '2026-08-30T19:15:00' },
];
const gamesCache = {};
const gamesOf = lg => (gamesCache[lg.id] = gamesCache[lg.id] || makeSampleSeason(lg.seed, lg.playedDays));

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
}
const lastPlayedOf = lg => readJSON('dl-last-played', {})[lg.id] || lg.lastPlayed;
function markPlayed(lg) {
  const map = readJSON('dl-last-played', {});
  map[lg.id] = new Date().toISOString();
  writeJSON('dl-last-played', map);
}
const byLastPlayed = () => SAVED_LEAGUES.slice().sort((a, b) => lastPlayedOf(b).localeCompare(lastPlayedOf(a)));

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
  const games = gamesOf(lg);
  const finals = games.filter(g => g.final);
  const rows = computeStandings(games);
  const leader = rankGroup(rows, LEAGUE.players.map(p => p.id))[0];
  return {
    day: Math.max(0, ...finals.map(g => g.day)),
    played: finals.length,
    total: games.length,
    leader: `${LEAGUE.players[leader.p].name} (${leader.w}–${leader.l})`,
  };
}

function renderSavedLeagues() {
  const list = document.getElementById('savedLeagues');
  list.innerHTML = byLastPlayed().map(lg => {
    const s = leagueSummary(lg);
    const on = lg.id === selectedLeague.id;
    return `<button type="button" class="saved" role="radio" aria-checked="${on}" data-id="${lg.id}">
      <span class="saved-name">${esc(lg.name)}</span>
      <span class="saved-col">${LEAGUE.players.length}</span>
      <span class="saved-col">Day ${s.day} · ${s.played}/${s.total}</span>
      <span class="saved-col">${esc(s.leader)}</span>
      <span class="saved-col saved-when">${whenText(lastPlayedOf(lg))}</span>
    </button>`;
  }).join('');
  document.getElementById('continueName').textContent = selectedLeague.name;
}

document.getElementById('savedLeagues').addEventListener('click', e => {
  const b = e.target.closest('.saved');
  if (!b) return;
  selectedLeague = SAVED_LEAGUES.find(lg => lg.id === b.dataset.id);
  renderSavedLeagues();
});

document.getElementById('continueBtn').addEventListener('click', () => {
  currentLeague = selectedLeague;
  markPlayed(currentLeague);
  location.hash = 'standings';
});
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtPct = x => (x === 1 ? '1.000' : x.toFixed(3).replace(/^0/, ''));
const rec = (w, l) => `${w}–${l}`;
const perGame = (n, gp) => (gp ? (n / gp).toFixed(1) : '—');

let standView = 'conf';
try { standView = localStorage.getItem('dl-stand-view') || 'conf'; } catch (e) { /* storage blocked */ }

const COLS = [
  ['#', 'l'], ['Player', 'l'], ['W'], ['L'], ['PCT'], ['GB'], ['Home'], ['Away'], ['Div'], ['Conf'],
  ['Inter'], ['PF/G'], ['PA/G'], ['Diff'], ['L10'], ['Strk'],
];

function standingsTable(title, sub, ranked, marks, withCutLines) {
  const head = '<tr>' + COLS.map(([t, c]) => `<th${c ? ` class="${c}"` : ''} scope="col">${t}</th>`).join('') + '</tr>';
  const body = ranked.map((r, i) => {
    const cut = withCutLines
      ? (i === LEAGUE.playoffSpots - 1 ? ' class="cut"' : i === LEAGUE.playoffSpots + LEAGUE.playInSpots - 1 ? ' class="cut2"' : '')
      : '';
    const m = marks[r.p];
    const chip = m ? ` <span class="mark mark-${m}" title="${MARKS[m]}">${m}</span>` : '';
    const diff = r.gp ? r.diff / r.gp : 0;
    return `<tr${cut}>
      <td class="l seed">${i + 1}</td>
      <th class="l" scope="row"><span class="pname">${esc(LEAGUE.players[r.p].name)}</span>${chip}</th>
      <td class="strong">${r.w}</td><td class="strong">${r.l}</td>
      <td>${fmtPct(r.pct)}</td><td>${r.gb === 0 ? '—' : r.gb.toFixed(1)}</td>
      <td>${rec(r.hw, r.hl)}</td><td>${rec(r.aw, r.al)}</td><td>${rec(r.dw, r.dl)}</td>
      <td>${rec(r.cw, r.cl)}</td><td>${rec(r.iw, r.il)}</td>
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
  const GAMES = gamesOf(currentLeague);
  const rows = computeStandings(GAMES);
  const marks = raceMarks(rows);
  const played = GAMES.filter(g => g.final).length;
  const lastDay = Math.max(0, ...GAMES.filter(g => g.final).map(g => g.day));

  document.querySelectorAll('#standTabs button').forEach(b => {
    b.setAttribute('aria-selected', String(b.dataset.view === standView));
  });
  document.getElementById('standLeague').textContent = currentLeague.name;
  document.getElementById('standMeta').textContent =
    `Through day ${lastDay} · ${played} of ${GAMES.length} games played`;

  let html = '';
  if (standView === 'conf') {
    html = LEAGUE.conferences.map((c, ci) =>
      standingsTable(`${c} Conference`, '', rankGroup(rows, playersInConf(ci)), marks, true)).join('');
  } else if (standView === 'div') {
    html = LEAGUE.divisions.map((d, di) =>
      standingsTable(`${d.name} Division`, LEAGUE.conferences[d.conf], rankGroup(rows, playersInDiv(di)), marks, false)).join('');
  } else {
    html = standingsTable('Whole League', '', rankGroup(rows, LEAGUE.players.map(p => p.id)), marks, false);
  }
  document.getElementById('standTables').innerHTML = html;
}

document.getElementById('standTabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  standView = b.dataset.view;
  try { localStorage.setItem('dl-stand-view', standView); } catch (err) { /* storage blocked */ }
  renderStandings();
});

// ---------- Page switching ----------
// Pages that aren't built yet show a "Coming soon" page.
const COMING = {
  'new-league': { title: 'New league', text: 'Set up a new 1 vs 1 league.', back: '1v1', backText: '1 vs 1' },
  'quick-game': { title: 'Quick Game', text: 'Two players, one game.' },
  'tournament': { title: 'Tournament', text: 'A knockout bracket with one winner.' },
  'practice': { title: 'Practice', text: 'Roll against the computer to learn the rules.' },
  '2v2': { title: '2 vs 2', text: 'Teams of two.' },
  '3v3': { title: '3 vs 3', text: 'Teams of three.' },
  '4v4': { title: '4 vs 4', text: 'Teams of four.' },
  '5v5': { title: '5 vs 5', text: 'Full teams of five.' },
  'rules': { title: 'Rules', text: 'How a game of Dice League works.' },
  'players': { title: 'Players', text: 'Everyone in the league.' },
  'options': { title: 'Options', text: 'League name, colors and other settings.' },
};

function showPage() {
  const key = location.hash.slice(1);
  const view = key === 'standings' ? 'standings' : key === '1v1' ? '1v1' : COMING[key] ? 'page' : 'home';
  for (const v of ['home', '1v1', 'standings', 'page']) document.getElementById('view-' + v).hidden = v !== view;

  if (view === 'standings') {
    renderStandings();
    document.title = 'Standings · Dice League';
  } else if (view === '1v1') {
    selectedLeague = byLastPlayed()[0]; // start on the league played last
    renderSavedLeagues();
    document.title = '1 vs 1 · Dice League';
  } else if (view === 'page') {
    document.getElementById('pageTitle').textContent = COMING[key].title;
    document.getElementById('pageText').textContent = COMING[key].text;
    const back = document.getElementById('pageBack');
    back.href = '#' + (COMING[key].back || '');
    back.lastChild.textContent = ' ' + (COMING[key].backText || 'Home');
    document.title = `${COMING[key].title} · Dice League`;
  } else {
    document.title = 'Dice League';
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', showPage);
showPage();

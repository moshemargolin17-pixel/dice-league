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
const GAMES = makeSampleSeason(); // swapped for real games once game logging exists
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
  const rows = computeStandings(GAMES);
  const marks = raceMarks(rows);
  const played = GAMES.filter(g => g.final).length;
  const lastDay = Math.max(0, ...GAMES.filter(g => g.final).map(g => g.day));

  document.querySelectorAll('#standTabs button').forEach(b => {
    b.setAttribute('aria-selected', String(b.dataset.view === standView));
  });
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
  const view = key === 'standings' ? 'standings' : COMING[key] ? 'page' : 'home';
  for (const v of ['home', 'standings', 'page']) document.getElementById('view-' + v).hidden = v !== view;

  if (view === 'standings') {
    renderStandings();
    document.title = 'Standings · Dice League';
  } else if (view === 'page') {
    document.getElementById('pageTitle').textContent = COMING[key].title;
    document.getElementById('pageText').textContent = COMING[key].text;
    document.title = `${COMING[key].title} · Dice League`;
  } else {
    document.title = 'Dice League';
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', showPage);
showPage();

// Dice League: home page dice tray and simple page switching.

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
const totalEl = document.getElementById('total');
const rollBtn = document.getElementById('rollBtn');

drawDie(dieA, Number(dieA.dataset.value));
drawDie(dieB, Number(dieB.dataset.value));

rollBtn.addEventListener('click', () => {
  const a = rollD6();
  const b = rollD6();
  for (const die of [dieA, dieB]) {
    die.classList.remove('rolling');
    void die.offsetWidth; // restart the animation
    die.classList.add('rolling');
  }
  // Change the faces partway through the tumble.
  setTimeout(() => {
    drawDie(dieA, a);
    drawDie(dieB, b);
    totalEl.textContent = a + b;
  }, 220);
});

// Pages that aren't built yet. Each link on the home page points to one of these.
const PAGES = {
  'quick-game': { title: 'Quick Game', text: 'Two players, one game.' },
  'season': { title: 'League Season', text: 'A full schedule, standings and a champion.' },
  'tournament': { title: 'Tournament', text: 'A knockout bracket with one winner.' },
  'practice': { title: 'Practice', text: 'Roll against the computer to learn the rules.' },
  'rules': { title: 'Rules', text: 'How a game of Dice League works.' },
  'players': { title: 'Players', text: 'Everyone in the league.' },
  'options': { title: 'Options', text: 'League name, colors and other settings.' },
};

function showPage() {
  const key = location.hash.slice(1);
  const page = PAGES[key];
  document.getElementById('view-home').hidden = Boolean(page);
  document.getElementById('view-page').hidden = !page;
  if (page) {
    document.getElementById('pageTitle').textContent = page.title;
    document.getElementById('pageText').textContent = page.text;
    document.title = `${page.title} · Dice League`;
  } else {
    document.title = 'Dice League';
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', showPage);
showPage();

# Dice League

A static site with no build step. Open `index.html` to pick a version.

| Folder | What it is |
|---|---|
| `index.html` | Sign in (one account for the whole site), then pick Dice League Original or Dice League 2.0 |
| `account.js` | The shared Supabase sign-in used by every page |
| `supabase.sql` | Supabase setup: the `league_docs` table and its access rules |
| `original/` | Dice League Original: `index.html` is its mode picker, `league.html` is the original league app. `config.js` holds optional Supabase settings (empty = saves in this browser). |
| `v2/` | Dice League 2.0: `index.html`, `style.css`, `app.js` (pages and setup), `league.js` (schedules, standings, playoffs), `pages.js` (Games, Players, Stats, Settings), `cloud.js` (saves leagues to the account under `v2/…`) |

Run locally:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

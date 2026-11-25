# Dice League

A static site with no build step. Open `index.html` to pick a version.

| Folder | What it is |
|---|---|
| `index.html` | Sign in (one account for the whole site), then pick Dice League Original or Dice League 2.0 |
| `account.js` | The shared Supabase sign-in used by every page |
| `supabase.sql` | Supabase setup: the `league_docs` table and its access rules |
| `original/` | Dice League Original: `index.html` is its mode picker, `league.html` is the original league app. `config.js` holds optional Supabase settings (empty = saves in this browser). |
| `v2/` | Dice League 2.0: `index.html` (modes) and `league.html`. Possession basketball with four dice per player (read one die at a time), Offense/Defense stars and Shooter/All-Rounder/Rebounder types, a live play-by-play, box scores and season box score stats; 48 possessions a game, 7-possession overtimes. It saves apart from the Original: to the account under `v2x/…`, and in the browser under `diceLeague2:` |

Run locally:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

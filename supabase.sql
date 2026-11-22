-- Dice League: Supabase setup.
-- Paste all of this into Supabase → SQL Editor → New query, then press Run. Running it twice is safe.

-- Every saved piece of a league (settings, seasons, games) is one row, owned by the signed-in user.
create table if not exists public.league_docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  path       text        not null,
  body       jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, path)
);

-- Signed-in players may use the table (the policies below still limit them to their own rows).
-- Signed-out visitors get no access at all.
grant select, insert, update, delete on public.league_docs to authenticated;
revoke all on public.league_docs from anon;

-- Row level security: each person can only see and change their own rows.
alter table public.league_docs enable row level security;

drop policy if exists "Read own league docs" on public.league_docs;
create policy "Read own league docs" on public.league_docs
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Add own league docs" on public.league_docs;
create policy "Add own league docs" on public.league_docs
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Change own league docs" on public.league_docs;
create policy "Change own league docs" on public.league_docs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Delete own league docs" on public.league_docs;
create policy "Delete own league docs" on public.league_docs
  for delete to authenticated using (auth.uid() = user_id);

-- Speeds up loading a league's games ("path like 'games/%'").
create index if not exists league_docs_path_idx on public.league_docs (user_id, path text_pattern_ops);

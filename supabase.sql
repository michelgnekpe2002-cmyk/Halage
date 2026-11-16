-- À coller dans Supabase > SQL Editor > New query, puis "Run".
create table if not exists public.events (
  id text primary key,
  couple text not null,
  user_id text not null,
  kind text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists events_couple_idx on public.events (couple, created_at);

alter table public.events enable row level security;
grant select, insert on public.events to anon;

drop policy if exists "lecture" on public.events;
create policy "lecture" on public.events for select to anon using (true);
drop policy if exists "ajout" on public.events;
create policy "ajout" on public.events for insert to anon with check (length(couple) >= 12);

-- Données santé (Samsung Health via Health Connect, Santé iPhone via Raccourci) : une ligne par personne et par jour.
create table if not exists public.health_days (
  couple text not null,
  user_id text not null,
  day text not null,
  data jsonb not null default '{}',
  source text,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists health_couple_idx on public.health_days (couple, day);

alter table public.health_days enable row level security;
grant select, insert, update on public.health_days to anon;

drop policy if exists "lecture" on public.health_days;
create policy "lecture" on public.health_days for select to anon using (true);
drop policy if exists "ajout" on public.health_days;
create policy "ajout" on public.health_days for insert to anon with check (length(couple) >= 12);
drop policy if exists "maj" on public.health_days;
create policy "maj" on public.health_days for update to anon using (true) with check (length(couple) >= 12);

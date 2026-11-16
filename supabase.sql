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

-- Halage : deux tables isolées (préfixe halage_), sans lien avec le reste de la base.
-- Verrou : chaque requête doit envoyer l'en-tête « x-couple » avec le code secret du couple.
-- Sans ce code, la clé publique seule ne permet de lire ni d'écrire aucune ligne.

create or replace function public.halage_couple() returns text
language sql stable
as $$ select coalesce(current_setting('request.headers', true)::json ->> 'x-couple', '') $$;

-- Séances, profils, encouragements
create table if not exists public.halage_events (
  id text primary key,
  couple text not null,
  user_id text not null,
  kind text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists halage_events_couple_idx on public.halage_events (couple, created_at);

-- Données santé : une ligne par personne et par jour
create table if not exists public.halage_health (
  couple text not null,
  user_id text not null,
  day text not null,
  data jsonb not null default '{}',
  source text,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists halage_health_couple_idx on public.halage_health (couple, day);

alter table public.halage_events enable row level security;
alter table public.halage_health enable row level security;
grant select, insert on public.halage_events to anon;
grant select, insert, update on public.halage_health to anon;

drop policy if exists "halage lecture" on public.halage_events;
create policy "halage lecture" on public.halage_events for select to anon
  using (length(couple) >= 12 and couple = public.halage_couple());
drop policy if exists "halage ajout" on public.halage_events;
create policy "halage ajout" on public.halage_events for insert to anon
  with check (length(couple) >= 12 and couple = public.halage_couple());

drop policy if exists "halage lecture" on public.halage_health;
create policy "halage lecture" on public.halage_health for select to anon
  using (length(couple) >= 12 and couple = public.halage_couple());
drop policy if exists "halage ajout" on public.halage_health;
create policy "halage ajout" on public.halage_health for insert to anon
  with check (length(couple) >= 12 and couple = public.halage_couple());
drop policy if exists "halage maj" on public.halage_health;
create policy "halage maj" on public.halage_health for update to anon
  using (length(couple) >= 12 and couple = public.halage_couple())
  with check (length(couple) >= 12 and couple = public.halage_couple());

notify pgrst, 'reload schema';

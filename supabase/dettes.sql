-- Dettes & épargne v2 (balance par catégorie, hors trésorerie)

create table dette_categorie (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  type_bloc text not null check (type_bloc in ('dette', 'epargne')),
  solde numeric(12, 2) not null default 0 check (solde >= 0),
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

create unique index dette_categorie_nom_type_bloc on dette_categorie (type_bloc, lower(trim(nom)));

create table dette_synthese_globale (
  cle text primary key default 'global',
  cumul_emprunts numeric(12, 2) not null default 0 check (cumul_emprunts >= 0),
  cumul_remboursements numeric(12, 2) not null default 0 check (cumul_remboursements >= 0),
  date_modification timestamptz not null default now()
);

insert into dette_synthese_globale (cle) values ('global')
  on conflict (cle) do nothing;

alter table dette_categorie enable row level security;
alter table dette_synthese_globale enable row level security;

drop policy if exists "dette_categorie_all" on dette_categorie;
drop policy if exists "dette_synthese_globale_all" on dette_synthese_globale;

create policy "dette_categorie_all" on dette_categorie for all to authenticated using (true) with check (true);
create policy "dette_synthese_globale_all" on dette_synthese_globale for all to authenticated using (true) with check (true);

grant select, insert, update, delete on dette_categorie, dette_synthese_globale to authenticated;

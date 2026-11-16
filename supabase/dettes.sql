-- Dettes & épargne v2 (balance par catégorie, hors trésorerie)

create table debt_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('dette', 'epargne')),
  balance numeric(12, 2) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index debt_categories_name_kind on debt_categories (kind, lower(trim(name)));

create table debt_stats (
  scope text primary key default 'global',
  total_borrowed_dette numeric(12, 2) not null default 0 check (total_borrowed_dette >= 0),
  total_repaid_dette numeric(12, 2) not null default 0 check (total_repaid_dette >= 0),
  updated_at timestamptz not null default now()
);

insert into debt_stats (scope) values ('global')
  on conflict (scope) do nothing;

alter table debt_categories enable row level security;
alter table debt_stats enable row level security;

drop policy if exists "debt_categories_all" on debt_categories;
drop policy if exists "debt_stats_all" on debt_stats;

create policy "debt_categories_all" on debt_categories for all to authenticated using (true) with check (true);
create policy "debt_stats_all" on debt_stats for all to authenticated using (true) with check (true);

grant select, insert, update, delete on debt_categories, debt_stats to authenticated;

-- Реестр РАТ (применить вручную в Supabase SQL Editor при необходимости)
-- См. также спецификацию блока «Реестр РАТ»

create table if not exists registry_cache (
  id uuid primary key default gen_random_uuid(),
  inn text not null,
  license_number text,
  company_name text,
  status text,
  valid_from date,
  valid_to date,
  activity_type text,
  license_label text,
  license_color text,
  addresses jsonb,
  kpp text,
  raw_data jsonb,
  downloaded_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_registry_cache_inn on registry_cache(inn);
create index if not exists idx_registry_cache_license_number on registry_cache(license_number);
create index if not exists idx_registry_cache_downloaded_at on registry_cache(downloaded_at);

create table if not exists registry_meta (
  id int primary key default 1,
  last_downloaded_at timestamptz,
  csv_url text,
  csv_size_bytes bigint,
  total_records int,
  constraint only_one_row check (id = 1)
);

insert into registry_meta (id) values (1) on conflict (id) do nothing;

create table if not exists license_status_history (
  id uuid primary key default gen_random_uuid(),
  inn text not null,
  license_number text,
  old_status text,
  new_status text,
  detected_at timestamptz default now()
);

create table if not exists function_logs (
  id uuid primary key default gen_random_uuid(),
  function_name text,
  level text,
  message text,
  payload jsonb,
  created_at timestamptz default now()
);

alter table registry_cache enable row level security;
drop policy if exists "allow_all" on registry_cache;
create policy "allow_all" on registry_cache for all using (true) with check (true);

alter table registry_meta enable row level security;
drop policy if exists "allow_all" on registry_meta;
create policy "allow_all" on registry_meta for all using (true) with check (true);

alter table license_status_history enable row level security;
drop policy if exists "allow_all" on license_status_history;
create policy "allow_all" on license_status_history for all using (true) with check (true);

alter table function_logs enable row level security;
drop policy if exists "allow_all" on function_logs;
create policy "allow_all" on function_logs for all using (true) with check (true);

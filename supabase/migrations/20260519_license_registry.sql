-- Реестр лицензий РАТ: кэш, метаданные синхронизации, история статусов, логи

create table if not exists registry_cache (
  id uuid primary key default gen_random_uuid(),
  inn text,
  license_number text,
  company_name text,
  status text,
  valid_from date,
  valid_to date,
  activity_type text,
  raw_data jsonb,
  downloaded_at timestamptz default now()
);

create index if not exists idx_registry_cache_inn on registry_cache(inn);
create index if not exists idx_registry_cache_license_number on registry_cache(license_number);
create index if not exists idx_registry_cache_downloaded_at on registry_cache(downloaded_at desc);

create table if not exists registry_meta (
  id smallint primary key default 1 check (id = 1),
  last_downloaded_at timestamptz,
  csv_url text,
  row_count int
);

insert into registry_meta (id) values (1) on conflict (id) do nothing;

create table if not exists function_logs (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  level text not null default 'error',
  message text,
  details jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_function_logs_created on function_logs(created_at desc);

create table if not exists license_status_history (
  id uuid primary key default gen_random_uuid(),
  license_id uuid references licenses(id) on delete cascade,
  old_status text,
  new_status text,
  checked_at timestamptz default now(),
  source text default 'registry'
);

create index if not exists idx_license_status_history_license on license_status_history(license_id);

-- pg_cron: ежедневная проверка в 03:00 МСК (00:00 UTC)
-- Требует расширений pg_cron и pg_net в Supabase Dashboard
-- select cron.schedule(
--   'daily-license-check',
--   '0 0 * * *',
--   $$select net.http_post(
--     url := 'https://xcldnsbnzuplsrwahrcf.supabase.co/functions/v1/license-registry-lookup',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--     body := '{"mode":"batch_all"}'::jsonb
--   )$$
-- );

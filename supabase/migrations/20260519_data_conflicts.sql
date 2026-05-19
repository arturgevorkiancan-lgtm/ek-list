-- Конфликты между источниками данных (ЕГРЮЛ, лицензия, ЕГРН, техплан)
-- Применить вручную в SQL Editor при необходимости

create table if not exists data_conflicts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  warehouse_id uuid references warehouses(id) on delete cascade,
  field text not null,
  source_a text not null,
  value_a text,
  source_b text not null,
  value_b text,
  priority_source text,
  level text not null check (level in ('critical', 'important', 'info')),
  resolved boolean default false,
  resolved_at timestamptz,
  resolution_comment text,
  created_at timestamptz default now()
);

create index if not exists data_conflicts_client_id_idx on data_conflicts(client_id);
create index if not exists data_conflicts_warehouse_id_idx on data_conflicts(warehouse_id);
create index if not exists data_conflicts_resolved_idx on data_conflicts(resolved);

create table if not exists source_priorities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  field text not null,
  priority_order text[] not null,
  created_at timestamptz default now(),
  unique(client_id, field)
);

-- ЧЕК-Лист: схема БД Supabase

create type operation_type as enum (
  'ПОЛУЧЕНИЕ',
  'ПЕРЕОФОРМЛЕНИЕ',
  'ПРОДЛЕНИЕ',
  'ПРОВЕРКА_ВЫЕЗДНАЯ',
  'ПРОВЕРКА_ВНЕПЛАНОВАЯ'
);

create type checklist_status as enum ('draft', 'active', 'completed', 'archived');

create type item_status as enum ('not_started', 'in_progress', 'done', 'na');

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  inn text,
  kpp text,
  ogrn text,
  legal_address text,
  contact_person text,
  phone text,
  email text,
  egrn_data jsonb,
  created_at timestamptz default now()
);

create table licenses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  license_number text,
  issue_date date,
  expiry_date date,
  license_type text,
  license_activity text,
  license_status text,
  licensee_name text,
  licensee_kpp text,
  legal_address text,
  email text,
  addresses jsonb default '[]',
  created_at timestamptz default now()
);

create table license_addresses (
  id uuid primary key default gen_random_uuid(),
  license_id uuid references licenses(id) on delete cascade,
  address text not null,
  kpp text,
  notes text
);

create table checklists (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  license_id uuid references licenses(id) on delete set null,
  operation_type operation_type not null,
  product_types jsonb default '[]',
  status checklist_status default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid references checklists(id) on delete cascade,
  block_num int not null,
  item_num int not null,
  title text not null,
  notes text,
  status item_status default 'not_started',
  due_date date,
  completed_at timestamptz,
  comment text
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  checklist_id uuid references checklists(id) on delete cascade,
  item_id uuid references checklist_items(id) on delete set null,
  filename text not null,
  storage_path text,
  doc_type text,
  parsed_data jsonb,
  uploaded_at timestamptz default now()
);

create index idx_documents_client on documents(client_id);

create table warehouses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  kpp text,
  address text,
  cadastral_number text,
  area_sqm numeric,
  floor text,
  room_number text,
  object_purpose text,
  additional_address_info text,
  license_type text,
  created_at timestamptz default now()
);

create index idx_warehouses_client on warehouses(client_id);

alter table documents add column if not exists warehouse_id uuid references warehouses(id) on delete set null;

create index idx_clients_inn on clients(inn);
create index idx_licenses_client on licenses(client_id);
create index idx_licenses_expiry on licenses(expiry_date);
create index idx_checklists_client on checklists(client_id);
create index idx_checklist_items_checklist on checklist_items(checklist_id);

alter publication supabase_realtime add table checklist_items;

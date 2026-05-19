-- Client-level documents and EGRN storage
alter table clients add column if not exists egrn_data jsonb;

alter table documents add column if not exists client_id uuid references clients(id) on delete cascade;

alter table documents alter column checklist_id drop not null;

create index if not exists idx_documents_client on documents(client_id);

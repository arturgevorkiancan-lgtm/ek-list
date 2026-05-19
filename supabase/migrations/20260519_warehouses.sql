-- Warehouses and per-warehouse documents

CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  kpp text,
  address text,
  cadastral_number text,
  area_sqm numeric,
  floor text,
  room_number text,
  object_purpose text,
  additional_address_info text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_client ON warehouses(client_id);

ALTER TABLE rental_contracts
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL;

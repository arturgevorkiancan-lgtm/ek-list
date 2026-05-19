CREATE TABLE IF NOT EXISTS storage_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid REFERENCES warehouses(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  temperature numeric(4,1) NOT NULL,
  humidity numeric(4,1) NOT NULL,
  recorded_by text,
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_storage_readings_warehouse 
  ON storage_readings(warehouse_id, recorded_at DESC);

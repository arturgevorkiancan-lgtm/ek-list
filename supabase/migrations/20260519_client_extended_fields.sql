-- Extended client, license, license_addresses fields + rental_contracts

ALTER TABLE clients ADD COLUMN IF NOT EXISTS short_name text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS director_last_name text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS director_first_name text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS director_middle_name text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS director_phone text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS representative_name text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS representative_poa text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS alcohol_over_15_pct boolean;

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS renewal_years int DEFAULT 5;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS payment_order_number text;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS payment_order_date date;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS reissue_reason text;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS reissue_description text;

ALTER TABLE license_addresses ADD COLUMN IF NOT EXISTS cadastral_number text;
ALTER TABLE license_addresses ADD COLUMN IF NOT EXISTS area_sqm numeric;
ALTER TABLE license_addresses ADD COLUMN IF NOT EXISTS floor text;
ALTER TABLE license_addresses ADD COLUMN IF NOT EXISTS room_number text;
ALTER TABLE license_addresses ADD COLUMN IF NOT EXISTS object_purpose text;
ALTER TABLE license_addresses ADD COLUMN IF NOT EXISTS additional_address_info text;

CREATE TABLE IF NOT EXISTS rental_contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  contract_number text,
  contract_date date,
  landlord_name text,
  rent_start date,
  rent_end date,
  address text,
  area_sqm numeric,
  license_address_id uuid references license_addresses(id) on delete set null,
  parsed_data jsonb,
  created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_rental_contracts_client
  ON rental_contracts(client_id);

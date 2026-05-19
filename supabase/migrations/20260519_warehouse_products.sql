ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS product_types text[] DEFAULT '{}';

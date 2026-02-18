-- Rename tax_id_type value from ipn -> rnokpp for client records
-- and update default for new rows.

UPDATE clients
SET tax_id_type = 'rnokpp'
WHERE tax_id_type = 'ipn';

ALTER TABLE clients
  ALTER COLUMN tax_id_type SET DEFAULT 'rnokpp';

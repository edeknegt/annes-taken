-- =============================================================================
-- Migratie: today-kolom voor het Vandaag/Later-scherm
-- =============================================================================
-- Draai dit eenmalig in de Supabase SQL Editor. Voegt de 'today'-kolom toe
-- aan tasks (default false = Later). Bestaande taken komen dus automatisch
-- in Later terecht totdat ze naar Vandaag gesleept worden. Raakt geen
-- bestaande data aan.
-- =============================================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS today boolean NOT NULL DEFAULT false;

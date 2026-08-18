-- =============================================================================
-- Migratie: 'Morgen' als derde sectie tussen Vandaag en Later
-- =============================================================================
-- Draai dit eenmalig in de Supabase SQL Editor. Vervangt de boolean
-- 'today'-kolom op tasks door een tekst-kolom 'list' met drie waarden
-- ('today' | 'tomorrow' | 'later'). Bestaande taken migreren 1-op-1:
-- today=true -> 'today', today=false -> 'later'. Niets komt in 'tomorrow'
-- terecht totdat je er zelf iets naar toe sleept.
-- =============================================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS list text;

UPDATE tasks SET list = CASE WHEN today THEN 'today' ELSE 'later' END WHERE list IS NULL;

ALTER TABLE tasks ALTER COLUMN list SET DEFAULT 'later';
ALTER TABLE tasks ALTER COLUMN list SET NOT NULL;

ALTER TABLE tasks ADD CONSTRAINT tasks_list_check CHECK (list IN ('today', 'tomorrow', 'later'));

ALTER TABLE tasks DROP COLUMN today;

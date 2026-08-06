-- =============================================================================
-- Migratie: birth_year-kolom voor verjaardagen
-- =============================================================================
-- Draai dit eenmalig in de Supabase SQL Editor. Voegt de optionele
-- 'birth_year'-kolom toe aan task_rules — puur ter weergave bij
-- verjaardagen (categorie 'cadeaus'), heeft geen invloed op de jaarlijkse
-- herhaling zelf. Bestaande rijen blijven ongewijzigd (birth_year = NULL).
-- =============================================================================

ALTER TABLE task_rules ADD COLUMN IF NOT EXISTS birth_year integer;

-- =============================================================================
-- Migratie: 'Morgen'-sectie hernoemd naar 'Snel'
-- =============================================================================
-- Draai dit eenmalig in de Supabase SQL Editor. Hernoemt de list-waarde
-- 'tomorrow' naar 'quick' op bestaande taken en werkt de CHECK-constraint bij.
-- =============================================================================

UPDATE tasks SET list = 'quick' WHERE list = 'tomorrow';

ALTER TABLE tasks DROP CONSTRAINT tasks_list_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_list_check CHECK (list IN ('today', 'quick', 'later'));

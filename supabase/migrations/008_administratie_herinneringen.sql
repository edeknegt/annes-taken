-- =============================================================================
-- Migratie: categorieën 'administratie' en 'herinneringen'
-- =============================================================================
-- Draai dit eenmalig in de Supabase SQL Editor. Voegt twee categorieën toe aan
-- de CHECK-constraints van task_rules en tasks, en verhuist de bestaande taken
-- en taakregels die nu onder 'overig' vallen naar de juiste nieuwe categorie.
--
-- Administratie = uitzoeken en regelen (papieren, aanvragen, vergelijken).
-- Herinneringen = vastleggen en bewaren (fotoboek, groeiboek, brieven).
-- =============================================================================

ALTER TABLE task_rules DROP CONSTRAINT task_rules_category_check;
ALTER TABLE tasks      DROP CONSTRAINT tasks_category_check;

ALTER TABLE task_rules ADD CONSTRAINT task_rules_category_check
    CHECK (category IN ('huishouden', 'werk', 'inkopen', 'cadeaus', 'berichten', 'administratie', 'herinneringen', 'overig'));
ALTER TABLE tasks ADD CONSTRAINT tasks_category_check
    CHECK (category IN ('huishouden', 'werk', 'inkopen', 'cadeaus', 'berichten', 'administratie', 'herinneringen', 'overig'));

-- Bestaande terugkerende taakregels uit 'overig' herindelen.
UPDATE task_rules SET category = 'herinneringen'
 WHERE category = 'overig'
   AND name IN ('Fotoboek Olivia bijwerken', 'Oei ik groei boek invullen');

UPDATE task_rules SET category = 'administratie'
 WHERE category = 'overig'
   AND name IN ('Weekplanner bijwerken');

-- Bestaande losse taken uit 'overig' herindelen. Klusjes in en om het huis
-- (laptop schoonmaken, moestuin, onkruid, verf) blijven bewust 'overig'.
UPDATE tasks SET category = 'herinneringen'
 WHERE category = 'overig'
   AND name IN (
       'Brief schrijven',
       'Briefje en kaarten inplakken in boekjes',
       'Fotoboek Olivia bijwerken',
       'Oei ik groei boek invullen'
   );

UPDATE tasks SET category = 'administratie'
 WHERE category = 'overig'
   AND name IN ('Uitzoeken waterfilter');

-- =============================================================================
-- Migratie: categorie 'berichten' + rule_type 'once' + description-kolommen
-- =============================================================================
-- Draai dit eenmalig in de Supabase SQL Editor. Voegt de nieuwe categorie
-- 'berichten' en het eenmalige 'once'-rule_type toe (voor een bericht op een
-- specifieke datum, dat automatisch in Vandaag verschijnt), plus een
-- description-kolom op zowel task_rules als tasks. Raakt geen bestaande
-- data aan.
-- =============================================================================

ALTER TABLE task_rules ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description text;

DO $$
DECLARE
    con record;
BEGIN
    FOR con IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'task_rules'::regclass AND contype = 'c'
    LOOP
        EXECUTE format('ALTER TABLE task_rules DROP CONSTRAINT %I', con.conname);
    END LOOP;
    FOR con IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'tasks'::regclass AND contype = 'c'
    LOOP
        EXECUTE format('ALTER TABLE tasks DROP CONSTRAINT %I', con.conname);
    END LOOP;
END $$;

ALTER TABLE task_rules
    ADD CONSTRAINT task_rules_category_check
        CHECK (category IN ('huishouden', 'werk', 'inkopen', 'cadeaus', 'overig', 'berichten')),
    ADD CONSTRAINT task_rules_rule_type_check
        CHECK (rule_type IN ('fixed', 'after_completion', 'yearly', 'workday', 'after_workday', 'once')),
    ADD CONSTRAINT task_rules_recur_unit_check
        CHECK (recur_unit IS NULL OR recur_unit IN ('day', 'week', 'month')),
    ADD CONSTRAINT task_rules_shift_type_check
        CHECK (shift_type IS NULL OR shift_type IN ('dienst', 'spreekuur')),
    ADD CONSTRAINT task_rules_weekday_check
        CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
    ADD CONSTRAINT task_rules_check CHECK (
        (rule_type = 'fixed'            AND recur_unit IS NOT NULL AND month IS NULL AND shift_type IS NULL
                                         AND (day_of_month IS NULL OR (recur_unit = 'month' AND day_of_month BETWEEN 1 AND 28))
                                         AND (weekday IS NULL OR recur_unit = 'week')
                                         AND NOT (recur_unit = 'week' AND day_of_month IS NOT NULL)
                                         AND NOT (recur_unit = 'month' AND weekday IS NOT NULL)
                                         AND NOT (recur_unit = 'day' AND (day_of_month IS NOT NULL OR weekday IS NOT NULL)))
     OR (rule_type = 'after_completion' AND recur_unit IS NOT NULL AND day_of_month IS NULL AND weekday IS NULL AND month IS NULL AND shift_type IS NULL)
     OR (rule_type = 'yearly'           AND day_of_month BETWEEN 1 AND 31 AND month BETWEEN 1 AND 12 AND recur_unit IS NULL AND first_due_at IS NULL AND weekday IS NULL AND shift_type IS NULL)
     OR (rule_type = 'workday'          AND first_due_at IS NOT NULL AND shift_type IS NOT NULL AND recur_unit IS NULL AND day_of_month IS NULL AND weekday IS NULL AND month IS NULL)
     OR (rule_type = 'after_workday'    AND recur_unit IS NULL AND first_due_at IS NULL AND day_of_month IS NULL AND weekday IS NULL AND month IS NULL AND shift_type IS NULL)
     OR (rule_type = 'once'             AND first_due_at IS NOT NULL AND recur_unit IS NULL AND day_of_month IS NULL AND weekday IS NULL AND month IS NULL AND shift_type IS NULL)
    );

ALTER TABLE tasks
    ADD CONSTRAINT tasks_category_check
        CHECK (category IN ('huishouden', 'werk', 'inkopen', 'cadeaus', 'overig', 'berichten'));

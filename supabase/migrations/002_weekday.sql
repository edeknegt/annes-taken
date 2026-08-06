-- =============================================================================
-- Migratie: weekday-kolom + bijgewerkte CHECK-constraints voor 'Vast patroon'
-- =============================================================================
-- Draai dit eenmalig in de Supabase SQL Editor. Voegt de 'weekday'-kolom toe
-- (voor "elke N week(en) op <weekdag>") en vervangt de bestaande
-- CHECK-constraints op task_rules door de bijgewerkte versie (zie
-- supabase-schema.sql voor de volledige, actuele definitie). Bestaande rijen
-- blijven ongewijzigd — 'fixed'-regels zonder weekday/day_of_month vallen
-- nog steeds binnen de nieuwe constraint.
-- =============================================================================

ALTER TABLE task_rules ADD COLUMN IF NOT EXISTS weekday integer;

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
END $$;

ALTER TABLE task_rules
    ADD CONSTRAINT task_rules_rule_type_check
        CHECK (rule_type IN ('fixed', 'after_completion', 'yearly', 'workday', 'after_workday')),
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
    );

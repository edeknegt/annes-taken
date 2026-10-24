-- =============================================================================
-- Anne's taken - Volledig databaseschema (schema annes_taken)
-- =============================================================================
-- Draai dit in de SQL Editor van het Supabase-project 'annes-apps' om het
-- schema vanaf nul op te bouwen: tabellen, indexen, triggers en
-- RLS-policies. Taken en taakregels zijn gebruikersdata en zitten hier niet in.
--
-- annes-apps wordt gedeeld met annes-keuken en ak-verloskundige; elke app
-- heeft een eigen schema. Na het draaien: voeg 'annes_taken' toe bij
-- Settings -> Data API -> Exposed schemas, anders geeft de API
-- "Invalid schema".
--
-- Nieuwe wijzigingen: pas dit bestand aan zodat het de actuele stand blijft
-- beschrijven, en draai de wijziging los (ALTER ...) op de live database.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS annes_taken;
SET LOCAL search_path = annes_taken;

-- ---------------------------------------------------------------------------
-- Rechten voor de Data API-rollen
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA annes_taken TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA annes_taken GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA annes_taken GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA annes_taken GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trigger-functie: auto-update van updated_at bij wijzigingen
-- ---------------------------------------------------------------------------
CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- TASK_RULES - Herhaalregels die automatisch een taak aanmaken zodra due
-- ---------------------------------------------------------------------------
-- rule_type bepaalt welke velden van toepassing zijn:
--   fixed            -> vast patroon: interval_n + recur_unit (dag/week/
--                       maand), optioneel op een specifieke weekdag (week,
--                       via weekday 0-6) of dag-van-de-maand (maand, via
--                       day_of_month 1-28). Bij interval_n > 1 bepaalt
--                       first_due_at welke van de N-cyclus de eerste is;
--                       bij interval_n = 1 is dat niet nodig.
--   after_completion -> interval_n + recur_unit, maar de klok gaat pas lopen
--                       zodra de vorige taak wordt afgevinkt. first_due_at is
--                       de eerste due-datum, voordat er ooit is afgevinkt.
--   yearly           -> month (1..12) + day_of_month (1..31); gebruikt voor
--                       verjaardagen (categorie 'cadeaus'), komt 14 dagen
--                       vóór de datum als taak op. gift/card bepalen of er
--                       dan een losse "Cadeau <naam>"- en/of
--                       "Kaart <naam>"-taak wordt aangemaakt. birth_year is
--                       optioneel, puur ter weergave (heeft geen invloed op
--                       de jaarlijkse herhaling).
--   workday          -> eenmalige Dienst/Spreekuur (categorie 'werk') op
--                       first_due_at + shift_type. Wordt na materialiseren
--                       gedeactiveerd (geen herhaling), blijft als historie
--                       staan t.b.v. after_workday.
--   after_workday    -> geen eigen velden nodig; taak verschijnt op de datum
--                       van de laatst gelogde workday-regel.
--   once             -> eenmalig bericht (categorie 'berichten') op
--                       first_due_at, met een description. Verschijnt die
--                       dag direct in Vandaag (niet Later) en wordt na
--                       materialiseren gedeactiveerd, net als 'workday'.
--
-- Categorieen: administratie = uitzoeken en regelen (papieren, aanvragen,
-- vergelijken); herinneringen = vastleggen en bewaren (fotoboek, groeiboek,
-- brieven).
-- ---------------------------------------------------------------------------
CREATE TABLE task_rules (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    category          text        NOT NULL,
    name              text        NOT NULL,
    description       text,
    rule_type         text        NOT NULL,
    interval_n        integer     NOT NULL DEFAULT 1 CHECK (interval_n >= 1),
    recur_unit        text,
    first_due_at      date,
    day_of_month      integer,
    weekday           integer,
    month             integer,
    birth_year        integer,
    shift_type        text,
    gift              boolean     NOT NULL DEFAULT true,
    card              boolean     NOT NULL DEFAULT true,
    last_triggered_at timestamptz,
    active            boolean     NOT NULL DEFAULT true,
    created_at        timestamptz DEFAULT now(),

    CONSTRAINT task_rules_category_check
        CHECK (category IN ('huishouden', 'werk', 'inkopen', 'cadeaus', 'berichten', 'administratie', 'herinneringen', 'overig')),
    CONSTRAINT task_rules_rule_type_check
        CHECK (rule_type IN ('fixed', 'after_completion', 'yearly', 'workday', 'after_workday', 'once')),
    CONSTRAINT task_rules_recur_unit_check
        CHECK (recur_unit IS NULL OR recur_unit IN ('day', 'week', 'month')),
    CONSTRAINT task_rules_shift_type_check
        CHECK (shift_type IS NULL OR shift_type IN ('dienst', 'spreekuur')),
    CONSTRAINT task_rules_weekday_check
        CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
    CONSTRAINT task_rules_check CHECK (
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
    )
);

CREATE INDEX idx_task_rules_active ON task_rules (active);

-- ---------------------------------------------------------------------------
-- TASKS - Losse en automatisch-gematerialiseerde (uit een task_rule) taken
-- ---------------------------------------------------------------------------
-- Een terugkerende taak wordt automatisch aangemaakt zodra de bijbehorende
-- task_rule due is; na afvinken verdwijnt hij (via opschonen) en komt hij
-- vanzelf terug op de eerstvolgende due-datum.
--
-- list = Vandaag/Snel/Later: in welke sectie op de Taken-pagina de taak staat
-- (default 'later' voor nieuw gematerialiseerde herhaalde taken).
-- manual_sort_order is de sleepvolgorde binnen die sectie; categorie is puur
-- een badge/filter.
-- ---------------------------------------------------------------------------
CREATE TABLE tasks (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    category          text        NOT NULL,
    name              text        NOT NULL,
    -- Alleen gevuld voor uit een 'once'-bericht gematerialiseerde taken.
    description       text,
    manual_sort_order integer     NOT NULL DEFAULT 0,
    checked_at        timestamptz,
    task_rule_id      uuid        REFERENCES task_rules (id) ON DELETE SET NULL,
    list              text        NOT NULL DEFAULT 'later',
    created_at        timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now(),

    CONSTRAINT tasks_category_check
        CHECK (category IN ('huishouden', 'werk', 'inkopen', 'cadeaus', 'berichten', 'administratie', 'herinneringen', 'overig')),
    CONSTRAINT tasks_list_check
        CHECK (list IN ('today', 'quick', 'later'))
);

CREATE INDEX idx_tasks_category      ON tasks (category);
CREATE INDEX idx_tasks_checked_at    ON tasks (checked_at);
CREATE INDEX idx_tasks_category_sort ON tasks (category, manual_sort_order);

CREATE TRIGGER trigger_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- GIFT_HOLIDAY_TRIGGERS - Voortgang van de vaste, hardcoded
--    cadeau-herinneringen (Vaderdag/Moederdag, zie src/lib/gift-holidays.ts).
--    Deze feestdagen vallen niet op een vaste dag-van-de-maand (Nde zondag),
--    passen dus niet in task_rules; alleen de laatst-getriggerde datum per
--    holiday_key wordt hier bijgehouden. Niet aanpasbaar via de UI.
-- ---------------------------------------------------------------------------
CREATE TABLE gift_holiday_triggers (
    holiday_key       text        PRIMARY KEY,
    last_triggered_at timestamptz
);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- De app gebruikt PIN-bescherming op applicatieniveau (met de anon key en
-- de service role key), dus alle tabellen krijgen een permissieve policy.
-- =============================================================================
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['task_rules', 'tasks', 'gift_holiday_triggers']
    LOOP
        EXECUTE format('ALTER TABLE annes_taken.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON annes_taken.%I FOR ALL USING (true) WITH CHECK (true)',
                       'Allow all access to ' || t, t);
    END LOOP;
END $$;

GRANT ALL ON ALL TABLES IN SCHEMA annes_taken TO anon, authenticated, service_role;

COMMIT;

-- PostgREST het schema-overzicht opnieuw laten inlezen
NOTIFY pgrst, 'reload schema';

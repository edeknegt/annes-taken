-- =============================================================================
-- Anne's taken - Tasks Schema
-- =============================================================================
-- Taken met 5 vaste categorieen (huishouden, werk, inkopen, cadeaus,
-- overig) en herhaalregels (vaste cadans / na afvinken / jaarlijks).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Gedeelde trigger-functie: auto-update van updated_at bij wijzigingen.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 1. TASK_RULES - Herhaalregels die automatisch een taak aanmaken zodra due
-- ---------------------------------------------------------------------------
-- rule_type bepaalt welke velden van toepassing zijn:
--   fixed            -> vaste cadans, los van afvinken: interval_n + recur_unit
--                       (dag/week/maand), volgende due-datum = laatste keer
--                       gematerialiseerd + interval_n * recur_unit. Optioneel
--                       een first_due_at voor de allereerste keer.
--   after_completion -> interval_n + recur_unit, maar de klok gaat pas lopen
--                       zodra de vorige taak wordt afgevinkt. first_due_at is
--                       de eerste due-datum, voordat er ooit is afgevinkt.
--   yearly           -> month (1..12) + day_of_month (1..31); gebruikt voor
--                       verjaardagen (categorie 'cadeaus'), komt 14 dagen
--                       vóór de datum als taak op. gift/card bepalen of er
--                       dan een losse "Cadeau <naam>"- en/of
--                       "Kaart <naam>"-taak wordt aangemaakt.
--   workday          -> eenmalige Dienst/Spreekuur (categorie 'werk') op
--                       first_due_at + shift_type. Wordt na materialiseren
--                       gedeactiveerd (geen herhaling), blijft als historie
--                       staan t.b.v. after_workday.
--   after_workday    -> geen eigen velden nodig; taak verschijnt op de datum
--                       van de laatst gelogde workday-regel.
-- ---------------------------------------------------------------------------
CREATE TABLE task_rules (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    category          text        NOT NULL CHECK (category IN ('huishouden', 'werk', 'inkopen', 'cadeaus', 'overig')),
    name              text        NOT NULL,
    rule_type         text        NOT NULL CHECK (rule_type IN ('fixed', 'after_completion', 'yearly', 'workday', 'after_workday')),
    interval_n        integer     NOT NULL DEFAULT 1 CHECK (interval_n >= 1),
    recur_unit        text        CHECK (recur_unit IN ('day', 'week', 'month')),
    first_due_at      date,
    day_of_month      integer,
    month             integer,
    shift_type        text        CHECK (shift_type IN ('dienst', 'spreekuur')),
    gift              boolean     NOT NULL DEFAULT true,
    card              boolean     NOT NULL DEFAULT true,
    last_triggered_at timestamptz,
    active            boolean     NOT NULL DEFAULT true,
    created_at        timestamptz DEFAULT now(),

    CHECK (
        (rule_type = 'fixed'            AND recur_unit IS NOT NULL AND day_of_month IS NULL AND month IS NULL AND shift_type IS NULL)
     OR (rule_type = 'after_completion' AND recur_unit IS NOT NULL AND day_of_month IS NULL AND month IS NULL AND shift_type IS NULL)
     OR (rule_type = 'yearly'           AND day_of_month BETWEEN 1 AND 31 AND month BETWEEN 1 AND 12 AND recur_unit IS NULL AND first_due_at IS NULL AND shift_type IS NULL)
     OR (rule_type = 'workday'          AND first_due_at IS NOT NULL AND shift_type IS NOT NULL AND recur_unit IS NULL AND day_of_month IS NULL AND month IS NULL)
     OR (rule_type = 'after_workday'    AND recur_unit IS NULL AND first_due_at IS NULL AND day_of_month IS NULL AND month IS NULL AND shift_type IS NULL)
    )
);

CREATE INDEX idx_task_rules_active ON task_rules (active);

-- ---------------------------------------------------------------------------
-- 2. TASKS - Losse en automatisch-gematerialiseerde (uit een task_rule) taken
-- ---------------------------------------------------------------------------
-- Een terugkerende taak wordt automatisch aangemaakt zodra de bijbehorende
-- task_rule due is; na afvinken verdwijnt hij (via opschonen) en komt hij
-- vanzelf terug op de eerstvolgende due-datum. manual_sort_order bepaalt de
-- slepen-volgorde binnen een categorie.
-- ---------------------------------------------------------------------------
CREATE TABLE tasks (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    category          text        NOT NULL CHECK (category IN ('huishouden', 'werk', 'inkopen', 'cadeaus', 'overig')),
    name              text        NOT NULL,
    manual_sort_order integer     NOT NULL DEFAULT 0,
    checked_at        timestamptz,
    task_rule_id      uuid                 REFERENCES task_rules (id) ON DELETE SET NULL,
    created_at        timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_tasks_category      ON tasks (category);
CREATE INDEX idx_tasks_checked_at    ON tasks (checked_at);
CREATE INDEX idx_tasks_category_sort ON tasks (category, manual_sort_order);

CREATE TRIGGER trigger_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. GIFT_HOLIDAY_TRIGGERS - Voortgang van de 4 vaste, hardcoded
--    cadeau-herinneringen (Vaderdag/Moederdag, zie src/lib/gift-holidays.ts).
--    Deze feestdagen vallen niet op een vaste dag-van-de-maand (Nde zondag),
--    passen dus niet in task_rules; alleen de laatst-getriggerde datum per
--    holiday_key wordt hier bijgehouden. Niet aanpasbaar via de UI.
-- ---------------------------------------------------------------------------
CREATE TABLE gift_holiday_triggers (
    holiday_key       text        PRIMARY KEY,
    last_triggered_at timestamptz
);

-- ===========================================================================
-- ROW LEVEL SECURITY - Permissief, zoals elders in de app
-- ===========================================================================

ALTER TABLE task_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to task_rules"
    ON task_rules FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to tasks"
    ON tasks FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE gift_holiday_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to gift_holiday_triggers"
    ON gift_holiday_triggers FOR ALL USING (true) WITH CHECK (true);

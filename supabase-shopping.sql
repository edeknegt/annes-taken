-- =============================================================================
-- Anne's taken - Shopping List Schema
-- =============================================================================
-- Boodschappenlijst met schap-categorieen, producten-catalogus, groepen,
-- items en herhaalregels. Draai dit NA supabase-schema.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. SHOP_CATEGORIES - Schap-categorieen (volgorde ~ looproute supermarkt)
-- ---------------------------------------------------------------------------
CREATE TABLE shop_categories (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    slug        text        NOT NULL UNIQUE,
    sort_order  integer     NOT NULL DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. PRODUCTS - Basisproducten-catalogus (typeahead source)
-- ---------------------------------------------------------------------------
CREATE TABLE products (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text        NOT NULL,
    name_normalized   text        NOT NULL UNIQUE,   -- lowercase, voor matching/typeahead
    shop_category_id  uuid        NOT NULL REFERENCES shop_categories (id),
    is_seed           boolean     NOT NULL DEFAULT false,
    created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_products_name_normalized ON products (name_normalized);
CREATE INDEX idx_products_shop_category_id ON products (shop_category_id);

-- ---------------------------------------------------------------------------
-- 3. SHOPPING_GROUPS - Hoofdlijst + ad-hoc groepen (BBQ zaterdag etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE shopping_groups (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    is_default  boolean     NOT NULL DEFAULT false,
    sort_order  integer     NOT NULL DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

-- Slechts een groep mag is_default = true zijn
CREATE UNIQUE INDEX idx_shopping_groups_one_default
    ON shopping_groups (is_default)
    WHERE is_default = true;

-- ---------------------------------------------------------------------------
-- 4. SHOPPING_ITEMS - Items op de lijst
-- ---------------------------------------------------------------------------
-- amount_text is een vrij tekstveld ("500 g", "2 stuks", "een pakje").
-- shop_category_id en name worden gedenormaliseerd opgeslagen zodat het item
-- blijft werken als het gekoppelde product later wijzigt of verwijderd wordt.
-- manual_sort_order bepaalt de slepen-volgorde binnen de groep;
-- "sorteer op categorie" herbereken deze volgorde.
-- ---------------------------------------------------------------------------
CREATE TABLE shopping_items (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id          uuid        NOT NULL REFERENCES shopping_groups (id) ON DELETE CASCADE,
    product_id        uuid                 REFERENCES products (id) ON DELETE SET NULL,
    name              text        NOT NULL,
    amount_text       text,
    shop_category_id  uuid                 REFERENCES shop_categories (id) ON DELETE SET NULL,
    manual_sort_order integer     NOT NULL DEFAULT 0,
    checked_at        timestamptz,
    created_at        timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_shopping_items_group_id   ON shopping_items (group_id);
CREATE INDEX idx_shopping_items_checked_at ON shopping_items (checked_at);
CREATE INDEX idx_shopping_items_group_sort ON shopping_items (group_id, manual_sort_order);

CREATE TRIGGER trigger_shopping_items_updated_at
    BEFORE UPDATE ON shopping_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. RECURRING_RULES - Herhalende suggesties (wekelijks/maandelijks/interval)
-- ---------------------------------------------------------------------------
-- rule_type bepaalt welke velden van toepassing zijn:
--   weekly   -> interval_n (elke N weken)   + day_of_week (1=ma..7=zo)
--   monthly  -> interval_n (elke N maanden) + day_of_month (1..31)
--   interval -> interval_n (elke N dagen sinds vorige trigger)
-- ---------------------------------------------------------------------------
CREATE TABLE recurring_rules (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id        uuid                 REFERENCES products (id) ON DELETE SET NULL,
    name              text        NOT NULL,
    amount_text       text,
    rule_type         text        NOT NULL CHECK (rule_type IN ('weekly', 'monthly', 'interval')),
    interval_n        integer     NOT NULL DEFAULT 1 CHECK (interval_n >= 1),
    day_of_week       integer,
    day_of_month      integer,
    last_triggered_at timestamptz,
    active            boolean     NOT NULL DEFAULT true,
    created_at        timestamptz DEFAULT now(),

    CHECK (
        (rule_type = 'weekly'   AND day_of_week BETWEEN 1 AND 7  AND day_of_month IS NULL)
     OR (rule_type = 'monthly'  AND day_of_month BETWEEN 1 AND 31 AND day_of_week IS NULL)
     OR (rule_type = 'interval' AND day_of_week IS NULL AND day_of_month IS NULL)
    )
);

CREATE INDEX idx_recurring_rules_active ON recurring_rules (active);

-- ===========================================================================
-- ROW LEVEL SECURITY - Permissief, zoals elders in de app
-- ===========================================================================

ALTER TABLE shop_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to shop_categories"
    ON shop_categories FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to products"
    ON products FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE shopping_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to shopping_groups"
    ON shopping_groups FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to shopping_items"
    ON shopping_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE recurring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to recurring_rules"
    ON recurring_rules FOR ALL USING (true) WITH CHECK (true);

-- ===========================================================================
-- SEED DATA - Schap-categorieen (16)
-- ===========================================================================

INSERT INTO shop_categories (name, slug, sort_order) VALUES
    ('Groente & fruit',    'groente-fruit',     1),
    ('Zuivel',             'zuivel',            2),
    ('Vlees & vis',        'vlees-vis',         3),
    ('Brood & bakkerij',   'brood-bakkerij',    4),
    ('Diepvries',          'diepvries',         5),
    ('Pasta & rijst',      'pasta-rijst',       6),
    ('Conserven',          'conserven',         7),
    ('Sauzen & olie',      'sauzen-olie',       8),
    ('Ontbijt & beleg',    'ontbijt-beleg',     9),
    ('Snoep & koek',       'snoep-koek',       10),
    ('Bakproducten',       'bakproducten',     11),
    ('Kruiden',            'kruiden',          12),
    ('Dranken',            'dranken',          13),
    ('Huishouden',         'huishouden',       14),
    ('Verzorging',         'verzorging',       15),
    ('Overig',             'overig',           16);

-- ===========================================================================
-- SEED DATA - Default groep "Hoofdlijst"
-- ===========================================================================

INSERT INTO shopping_groups (name, is_default, sort_order) VALUES
    ('Hoofdlijst', true, 0);

-- ===========================================================================
-- SEED DATA - Basisproducten-catalogus
-- ===========================================================================

-- ---- Groente & fruit ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Ui',                   'ui',                   (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Rode ui',              'rode ui',              (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Sjalot',               'sjalot',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Prei',                 'prei',                 (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Knoflook',             'knoflook',             (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Bosui',                'bosui',                (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Lente-ui',             'lente-ui',             (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Wortel',               'wortel',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Bospeen',              'bospeen',              (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Aardappel',            'aardappel',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Zoete aardappel',      'zoete aardappel',      (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Tomaat',               'tomaat',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Cherrytomaat',         'cherrytomaat',         (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Trostomaat',           'trostomaat',           (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Vleestomaat',          'vleestomaat',          (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Komkommer',            'komkommer',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Courgette',            'courgette',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Aubergine',            'aubergine',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Paprika rood',         'paprika rood',         (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Paprika geel',         'paprika geel',         (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Paprika groen',        'paprika groen',        (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Paprika oranje',       'paprika oranje',       (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Broccoli',             'broccoli',             (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Bloemkool',            'bloemkool',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Romanesco',            'romanesco',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Spruitjes',            'spruitjes',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Sla',                  'sla',                  (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('IJsbergsla',           'ijsbergsla',           (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Rucola',               'rucola',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Veldsla',              'veldsla',              (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Little gem',           'little gem',           (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Eikenbladsla',         'eikenbladsla',         (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Spinazie',             'spinazie',             (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Andijvie',             'andijvie',             (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Boerenkool',           'boerenkool',           (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Paksoi',               'paksoi',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Snijbonen',            'snijbonen',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Sperziebonen',         'sperziebonen',         (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Doperwten',            'doperwten',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Suikermais',           'suikermais',           (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Tuinbonen',            'tuinbonen',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Witlof',               'witlof',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Rode kool',            'rode kool',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Witte kool',           'witte kool',           (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Spitskool',            'spitskool',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Savooiekool',          'savooiekool',          (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Radijs',               'radijs',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Bleekselderij',        'bleekselderij',        (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Knolselderij',         'knolselderij',         (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Koolrabi',             'koolrabi',             (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Venkel',               'venkel',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Pastinaak',            'pastinaak',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Pompoen',              'pompoen',              (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Butternut',            'butternut',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Flespompoen',          'flespompoen',          (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Champignons',          'champignons',          (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Kastanjechampignons',  'kastanjechampignons',  (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Oesterzwammen',        'oesterzwammen',        (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Shiitake',             'shiitake',             (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Asperges groen',       'asperges groen',       (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Asperges wit',         'asperges wit',         (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Peterselie (vers)',    'peterselie (vers)',    (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Bieslook (vers)',      'bieslook (vers)',      (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Basilicum (vers)',     'basilicum (vers)',     (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Koriander (vers)',     'koriander (vers)',     (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Dille (vers)',         'dille (vers)',         (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Munt (vers)',          'munt (vers)',          (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Tijm (vers)',          'tijm (vers)',          (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Rozemarijn (vers)',    'rozemarijn (vers)',    (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Salie (vers)',         'salie (vers)',         (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Gember',               'gember',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Citroengras',          'citroengras',          (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Chilipeper',           'chilipeper',           (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Rode peper',           'rode peper',           (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Taugé',                'taugé',                (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Rabarber',             'rabarber',             (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Appel',                'appel',                (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Peer',                 'peer',                 (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Banaan',               'banaan',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Sinaasappel',          'sinaasappel',          (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Mandarijn',            'mandarijn',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Citroen',              'citroen',              (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Limoen',               'limoen',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Grapefruit',           'grapefruit',           (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Pomelo',               'pomelo',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Druiven wit',          'druiven wit',          (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Druiven blauw',        'druiven blauw',        (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Aardbeien',            'aardbeien',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Frambozen',            'frambozen',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Bramen',               'bramen',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Blauwe bessen',        'blauwe bessen',        (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Rode bessen',          'rode bessen',          (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Kersen',               'kersen',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Meloen',               'meloen',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Watermeloen',          'watermeloen',          (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Galiameloen',          'galiameloen',          (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Cantaloupemeloen',     'cantaloupemeloen',     (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Ananas',               'ananas',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Mango',                'mango',                (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Papaja',               'papaja',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Kiwi',                 'kiwi',                 (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Perzik',               'perzik',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Nectarine',            'nectarine',            (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Abrikoos',             'abrikoos',             (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Pruim',                'pruim',                (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Avocado',              'avocado',              (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Passievrucht',         'passievrucht',         (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Lychee',               'lychee',               (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Granaatappel',         'granaatappel',         (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true),
    ('Vijg',                 'vijg',                 (SELECT id FROM shop_categories WHERE slug = 'groente-fruit'), true);

-- ---- Zuivel ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Volle melk',           'volle melk',           (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Halfvolle melk',       'halfvolle melk',       (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Magere melk',          'magere melk',          (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Karnemelk',            'karnemelk',            (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Sojadrink',            'sojadrink',            (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Haverdrink',           'haverdrink',           (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Amandeldrink',         'amandeldrink',         (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Kokosdrink',           'kokosdrink',           (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Yoghurt',              'yoghurt',              (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Griekse yoghurt',      'griekse yoghurt',      (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Kwark',                'kwark',                (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Magere kwark',         'magere kwark',         (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Vla',                  'vla',                  (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Slagroom',             'slagroom',             (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Kookroom',             'kookroom',             (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Crème fraîche',        'crème fraîche',        (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Zure room',            'zure room',            (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Roomboter',            'roomboter',            (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Margarine',            'margarine',            (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Halvarine',            'halvarine',            (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Bakboter',             'bakboter',             (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Jonge kaas',           'jonge kaas',           (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Jong belegen kaas',    'jong belegen kaas',    (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Belegen kaas',         'belegen kaas',         (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Oude kaas',            'oude kaas',            (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Geraspte kaas',        'geraspte kaas',        (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Parmezaanse kaas',     'parmezaanse kaas',     (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Mozzarella',           'mozzarella',           (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Feta',                 'feta',                 (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Hüttenkäse',           'hüttenkäse',           (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Ricotta',              'ricotta',              (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Mascarpone',           'mascarpone',           (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Brie',                 'brie',                 (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Camembert',            'camembert',            (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Geitenkaas',           'geitenkaas',           (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Eieren',               'eieren',               (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true),
    ('Scharreleieren',       'scharreleieren',       (SELECT id FROM shop_categories WHERE slug = 'zuivel'), true);

-- ---- Vlees & vis ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Kipfilet',             'kipfilet',             (SELECT id FROM shop_categories WHERE slug = 'vlees-vis'), true),
    ('Gehakt',               'gehakt',               (SELECT id FROM shop_categories WHERE slug = 'vlees-vis'), true);

-- ---- Brood & bakkerij ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Bruin brood',          'bruin brood',          (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Wit brood',            'wit brood',            (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Volkoren brood',       'volkoren brood',       (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Meergranenbrood',      'meergranenbrood',      (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Speltbrood',           'speltbrood',           (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Stokbrood',            'stokbrood',            (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Ciabatta',             'ciabatta',             (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Pistoletjes',          'pistoletjes',          (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Krentenbollen',        'krentenbollen',        (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Krentenbrood',         'krentenbrood',         (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Rozijnenbrood',        'rozijnenbrood',        (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Beschuit',             'beschuit',             (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Ontbijtkoek',          'ontbijtkoek',          (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Pitabrood',            'pitabrood',            (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Wraps',                'wraps',                (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Tortilla',             'tortilla',             (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Naanbrood',            'naanbrood',            (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true),
    ('Croissant',            'croissant',            (SELECT id FROM shop_categories WHERE slug = 'brood-bakkerij'), true);

-- ---- Diepvries ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Diepvrieserwten',      'diepvrieserwten',      (SELECT id FROM shop_categories WHERE slug = 'diepvries'), true),
    ('Diepvriesspinazie',    'diepvriesspinazie',    (SELECT id FROM shop_categories WHERE slug = 'diepvries'), true),
    ('Diepvriesbroccoli',    'diepvriesbroccoli',    (SELECT id FROM shop_categories WHERE slug = 'diepvries'), true),
    ('Diepvriestuinbonen',   'diepvriestuinbonen',   (SELECT id FROM shop_categories WHERE slug = 'diepvries'), true),
    ('Diepvriesgroente-mix', 'diepvriesgroente-mix', (SELECT id FROM shop_categories WHERE slug = 'diepvries'), true),
    ('Diepvriesmais',        'diepvriesmais',        (SELECT id FROM shop_categories WHERE slug = 'diepvries'), true),
    ('Diepvriesbessenmix',   'diepvriesbessenmix',   (SELECT id FROM shop_categories WHERE slug = 'diepvries'), true),
    ('Diepvriespizza',       'diepvriespizza',       (SELECT id FROM shop_categories WHERE slug = 'diepvries'), true),
    ('Diepvriesfrites',      'diepvriesfrites',      (SELECT id FROM shop_categories WHERE slug = 'diepvries'), true),
    ('Vanille-ijs',          'vanille-ijs',          (SELECT id FROM shop_categories WHERE slug = 'diepvries'), true),
    ('Roomijs',              'roomijs',              (SELECT id FROM shop_categories WHERE slug = 'diepvries'), true),
    ('Diepvrieszalm',        'diepvrieszalm',        (SELECT id FROM shop_categories WHERE slug = 'diepvries'), true);

-- ---- Pasta & rijst ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Spaghetti',            'spaghetti',            (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Penne',                'penne',                (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Macaroni',             'macaroni',             (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Farfalle',             'farfalle',             (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Fusilli',              'fusilli',              (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Tagliatelle',          'tagliatelle',          (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Lasagnebladen',        'lasagnebladen',        (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Rijst',                'rijst',                (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Basmatirijst',         'basmatirijst',         (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Jasmijnrijst',         'jasmijnrijst',         (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Zilvervliesrijst',     'zilvervliesrijst',     (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Risottorijst',         'risottorijst',         (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Pandanrijst',          'pandanrijst',          (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Couscous',             'couscous',             (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Bulgur',               'bulgur',               (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Quinoa',               'quinoa',               (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Mie',                  'mie',                  (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true),
    ('Rijstnoedels',         'rijstnoedels',         (SELECT id FROM shop_categories WHERE slug = 'pasta-rijst'), true);

-- ---- Conserven ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Gepelde tomaten',      'gepelde tomaten',      (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Tomatenblokjes',       'tomatenblokjes',       (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Passata',              'passata',              (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Tomatenpuree',         'tomatenpuree',         (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Kikkererwten',         'kikkererwten',         (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Witte bonen',          'witte bonen',          (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Bruine bonen',         'bruine bonen',         (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Kidneybonen',          'kidneybonen',          (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Zwarte bonen',         'zwarte bonen',         (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Linzen',               'linzen',               (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Tonijn in blik',       'tonijn in blik',       (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Sardines',             'sardines',             (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Makreel in blik',      'makreel in blik',      (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Haring in blik',       'haring in blik',       (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Mais in blik',         'mais in blik',         (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Erwten in blik',       'erwten in blik',       (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Kokosmelk (blik)',     'kokosmelk (blik)',     (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Olijven zwart',        'olijven zwart',        (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Olijven groen',        'olijven groen',        (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Augurken',             'augurken',             (SELECT id FROM shop_categories WHERE slug = 'conserven'), true),
    ('Zilveruitjes',         'zilveruitjes',         (SELECT id FROM shop_categories WHERE slug = 'conserven'), true);

-- ---- Sauzen & olie ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Olijfolie',            'olijfolie',            (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Zonnebloemolie',       'zonnebloemolie',       (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Sesamolie',            'sesamolie',            (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Kokosolie',            'kokosolie',            (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Arachideolie',         'arachideolie',         (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Azijn',                'azijn',                (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Balsamico-azijn',      'balsamico-azijn',      (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Witte wijnazijn',      'witte wijnazijn',      (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Rode wijnazijn',       'rode wijnazijn',       (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Sojasaus',             'sojasaus',             (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Oestersaus',           'oestersaus',           (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Vissaus',              'vissaus',              (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Teriyakisaus',         'teriyakisaus',         (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Mayonaise',            'mayonaise',            (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Ketchup',              'ketchup',              (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Mosterd',              'mosterd',              (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Honingmosterd',        'honingmosterd',        (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Currysaus',            'currysaus',            (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Satésaus',             'satésaus',             (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Pindasaus',            'pindasaus',            (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Sweet chili',          'sweet chili',          (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Sriracha',             'sriracha',             (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Tabasco',              'tabasco',              (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Worcestersaus',        'worcestersaus',        (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Pesto rood',           'pesto rood',           (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Pesto groen',          'pesto groen',          (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Salsa',                'salsa',                (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Hummus',               'hummus',               (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Honing',               'honing',               (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true),
    ('Ahornsiroop',          'ahornsiroop',          (SELECT id FROM shop_categories WHERE slug = 'sauzen-olie'), true);

-- ---- Ontbijt & beleg ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Cornflakes',           'cornflakes',           (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Muesli',               'muesli',               (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Granola',              'granola',              (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Havermout',            'havermout',            (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Krokante muesli',      'krokante muesli',      (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Jam aardbei',          'jam aardbei',          (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Jam framboos',         'jam framboos',         (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Jam abrikoos',         'jam abrikoos',         (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Sinaasappelmarmelade', 'sinaasappelmarmelade', (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Pindakaas',            'pindakaas',            (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Chocoladepasta',       'chocoladepasta',       (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Nutella',              'nutella',              (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Hagelslag puur',       'hagelslag puur',       (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Hagelslag melk',       'hagelslag melk',       (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Vlokken puur',         'vlokken puur',         (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Vlokken melk',         'vlokken melk',         (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Vruchtenhagel',        'vruchtenhagel',        (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Muisjes',              'muisjes',              (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Gestampte muisjes',    'gestampte muisjes',    (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Ham',                  'ham',                  (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Achterham',            'achterham',            (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Kipfilet beleg',       'kipfilet beleg',       (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Rookvlees',            'rookvlees',            (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Rosbief',              'rosbief',              (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Cervelaat',            'cervelaat',            (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Salami',               'salami',               (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Boterhamworst',        'boterhamworst',        (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Filet americain',      'filet americain',      (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Leverworst',           'leverworst',           (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Appelstroop',          'appelstroop',          (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true),
    ('Tahin',                'tahin',                (SELECT id FROM shop_categories WHERE slug = 'ontbijt-beleg'), true);

-- ---- Snoep & koek ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Chocolade melk',       'chocolade melk',       (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Chocolade puur',       'chocolade puur',       (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Chocolade wit',        'chocolade wit',        (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Koekjes',              'koekjes',              (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Bastognekoek',         'bastognekoek',         (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Gevulde koek',         'gevulde koek',         (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Stroopwafels',         'stroopwafels',         (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Speculaas',            'speculaas',            (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Chips naturel',        'chips naturel',        (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Chips paprika',        'chips paprika',        (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Tortillachips',        'tortillachips',        (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Zoutjes',              'zoutjes',              (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Borrelnoten',          'borrelnoten',          (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Drop',                 'drop',                 (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Zoute drop',            'zoute drop',            (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Winegums',             'winegums',             (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Salmiak',              'salmiak',              (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Notenmix',             'notenmix',             (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Pinda''s',             'pinda''s',             (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Cashewnoten',          'cashewnoten',          (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Amandelen',            'amandelen',            (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Walnoten',             'walnoten',             (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Hazelnoten',           'hazelnoten',           (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Pistachenoten',        'pistachenoten',        (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Rozijnen',             'rozijnen',             (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Dadels',               'dadels',               (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Gedroogde abrikozen',  'gedroogde abrikozen',  (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Gedroogde cranberries','gedroogde cranberries',(SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true),
    ('Gedroogde vijgen',     'gedroogde vijgen',     (SELECT id FROM shop_categories WHERE slug = 'snoep-koek'), true);

-- ---- Bakproducten ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Bloem',                'bloem',                (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Tarwebloem',           'tarwebloem',           (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Patentbloem',          'patentbloem',          (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Volkorenmeel',         'volkorenmeel',         (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Zelfrijzend bakmeel',  'zelfrijzend bakmeel',  (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Maizena',              'maizena',              (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Suiker',               'suiker',               (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Rietsuiker',           'rietsuiker',           (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Basterdsuiker',        'basterdsuiker',        (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Bruine basterdsuiker', 'bruine basterdsuiker', (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Poedersuiker',         'poedersuiker',         (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Kristalsuiker',        'kristalsuiker',        (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Vanillesuiker',        'vanillesuiker',        (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Gist',                 'gist',                 (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Droge gist',           'droge gist',           (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Bakpoeder',            'bakpoeder',            (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Natriumbicarbonaat',   'natriumbicarbonaat',   (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Cacaopoeder',          'cacaopoeder',          (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Bakchocolade',         'bakchocolade',         (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Vanille-extract',      'vanille-extract',      (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Vanillestokje',        'vanillestokje',        (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Amandelspijs',         'amandelspijs',         (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Marsepein',            'marsepein',            (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true),
    ('Gelatine',             'gelatine',             (SELECT id FROM shop_categories WHERE slug = 'bakproducten'), true);

-- ---- Kruiden ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Zout',                 'zout',                 (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Zeezout',              'zeezout',              (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Peper (gemalen)',      'peper (gemalen)',      (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Peperkorrels',         'peperkorrels',         (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Paprikapoeder zoet',   'paprikapoeder zoet',   (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Paprikapoeder pikant', 'paprikapoeder pikant', (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Kerriepoeder',         'kerriepoeder',         (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Currypasta',           'currypasta',           (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Kaneel',               'kaneel',               (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Nootmuskaat',          'nootmuskaat',          (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Gemberpoeder',         'gemberpoeder',         (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Kurkuma',              'kurkuma',              (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Komijn',               'komijn',               (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Korianderpoeder',      'korianderpoeder',      (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Kardemom',             'kardemom',             (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Venkelzaad',           'venkelzaad',           (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Steranijs',            'steranijs',            (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Kruidnagel',           'kruidnagel',           (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Piment',               'piment',               (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Oregano (gedroogd)',   'oregano (gedroogd)',   (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Tijm (gedroogd)',      'tijm (gedroogd)',      (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Rozemarijn (gedroogd)','rozemarijn (gedroogd)',(SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Basilicum (gedroogd)', 'basilicum (gedroogd)', (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Laurier',              'laurier',              (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Bieslook (gedroogd)',  'bieslook (gedroogd)',  (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Peterselie (gedroogd)','peterselie (gedroogd)',(SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Italiaanse kruiden',   'italiaanse kruiden',   (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Provençaalse kruiden', 'provençaalse kruiden', (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Garam masala',         'garam masala',         (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Ras el hanout',        'ras el hanout',        (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Kip-kruiden',          'kip-kruiden',          (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Bouillonblokjes kip',  'bouillonblokjes kip',  (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Bouillonblokjes groente','bouillonblokjes groente', (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Bouillonblokjes rund', 'bouillonblokjes rund', (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Knoflookpoeder',       'knoflookpoeder',       (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Uienpoeder',           'uienpoeder',           (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Sesamzaad',            'sesamzaad',            (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true),
    ('Chilivlokken',         'chilivlokken',         (SELECT id FROM shop_categories WHERE slug = 'kruiden'), true);

-- ---- Dranken ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Koffiebonen',          'koffiebonen',          (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Koffiepads',           'koffiepads',           (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Koffiecapsules',       'koffiecapsules',       (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Oploskoffie',          'oploskoffie',          (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Thee zwart',           'thee zwart',           (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Thee groen',           'thee groen',           (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Kruidenthee',          'kruidenthee',          (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Rooibos',              'rooibos',              (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Muntthee',             'muntthee',             (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Mineraalwater',        'mineraalwater',        (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Bruiswater',           'bruiswater',           (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Appelsap',             'appelsap',             (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Sinaasappelsap',       'sinaasappelsap',       (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Multivruchtensap',     'multivruchtensap',     (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Cola',                 'cola',                 (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Cola light',           'cola light',           (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Cola zero',            'cola zero',            (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Fanta',                'fanta',                (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Sprite',               'sprite',               (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('7up',                  '7up',                  (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Ice tea',              'ice tea',              (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Pils',                 'pils',                 (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Speciaalbier',         'speciaalbier',         (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Rode wijn',            'rode wijn',            (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Witte wijn',           'witte wijn',           (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Rosé',                 'rosé',                 (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Prosecco',             'prosecco',             (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Champagne',            'champagne',            (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Cava',                 'cava',                 (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Limonadesiroop',       'limonadesiroop',       (SELECT id FROM shop_categories WHERE slug = 'dranken'), true),
    ('Ranja',                'ranja',                (SELECT id FROM shop_categories WHERE slug = 'dranken'), true);

-- ---- Huishouden ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Afwasmiddel',          'afwasmiddel',          (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Vaatwastabletten',     'vaatwastabletten',     (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Vaatwasserzout',       'vaatwasserzout',       (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Glansspoelmiddel',     'glansspoelmiddel',     (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Wasmiddel',            'wasmiddel',            (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Vloeibaar wasmiddel',  'vloeibaar wasmiddel',  (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Waspods',              'waspods',              (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Wasverzachter',        'wasverzachter',        (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Vlekverwijderaar',     'vlekverwijderaar',     (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Allesreiniger',        'allesreiniger',        (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Schoonmaakazijn',      'schoonmaakazijn',      (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Glasreiniger',         'glasreiniger',         (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Toiletreiniger',       'toiletreiniger',       (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Keukenreiniger',       'keukenreiniger',       (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Badkamerreiniger',     'badkamerreiniger',     (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Afvalzakken',          'afvalzakken',          (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Diepvrieszakken',      'diepvrieszakken',      (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Vuilniszakken',        'vuilniszakken',        (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Theedoeken',           'theedoeken',           (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Sponzen',              'sponzen',              (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Schuursponsjes',       'schuursponsjes',       (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Schoonmaakdoekjes',    'schoonmaakdoekjes',    (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Vaatdoeken',           'vaatdoeken',           (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Microvezeldoek',       'microvezeldoek',       (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Wc-papier',            'wc-papier',            (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Keukenrol',            'keukenrol',            (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Zakdoeken',            'zakdoeken',            (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Papieren servetten',   'papieren servetten',   (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Aluminiumfolie',       'aluminiumfolie',       (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Bakpapier',            'bakpapier',            (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true),
    ('Vershoudfolie',        'vershoudfolie',        (SELECT id FROM shop_categories WHERE slug = 'huishouden'), true);

-- ---- Verzorging ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Tandpasta',            'tandpasta',            (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Tandenborstel',        'tandenborstel',        (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Mondwater',            'mondwater',            (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Flosdraad',            'flosdraad',            (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Tandenragers',         'tandenragers',         (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Shampoo',              'shampoo',              (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Conditioner',          'conditioner',          (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Haarmasker',           'haarmasker',           (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Haarspray',            'haarspray',            (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Haargel',              'haargel',              (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Haarverf',             'haarverf',             (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Droogshampoo',         'droogshampoo',         (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Douchegel',            'douchegel',            (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Douchecrème',          'douchecrème',          (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Handzeep',             'handzeep',             (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Badschuim',            'badschuim',            (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Zeepblokje',           'zeepblokje',           (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Deodorant',            'deodorant',            (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Scheermesjes',         'scheermesjes',         (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Scheergel',            'scheergel',            (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Scheerschuim',         'scheerschuim',         (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Aftershave',           'aftershave',           (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Bodylotion',           'bodylotion',           (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Handcrème',            'handcrème',            (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Gezichtscrème',        'gezichtscrème',        (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Zonnebrand',           'zonnebrand',           (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Lippenbalsem',         'lippenbalsem',         (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Maandverband',         'maandverband',         (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Tampons',              'tampons',              (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Inlegkruisjes',        'inlegkruisjes',        (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Luiers',               'luiers',               (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Billendoekjes',        'billendoekjes',        (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Wattenstaafjes',       'wattenstaafjes',       (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true),
    ('Wattenschijfjes',      'wattenschijfjes',      (SELECT id FROM shop_categories WHERE slug = 'verzorging'), true);

-- ---- Overig ----
INSERT INTO products (name, name_normalized, shop_category_id, is_seed) VALUES
    ('Hondenvoer',           'hondenvoer',           (SELECT id FROM shop_categories WHERE slug = 'overig'), true),
    ('Kattenvoer',           'kattenvoer',           (SELECT id FROM shop_categories WHERE slug = 'overig'), true),
    ('Kattenbakvulling',     'kattenbakvulling',     (SELECT id FROM shop_categories WHERE slug = 'overig'), true),
    ('Kaarsen',              'kaarsen',              (SELECT id FROM shop_categories WHERE slug = 'overig'), true),
    ('Batterijen',           'batterijen',           (SELECT id FROM shop_categories WHERE slug = 'overig'), true),
    ('Lucifers',             'lucifers',             (SELECT id FROM shop_categories WHERE slug = 'overig'), true),
    ('Aanstekers',           'aanstekers',           (SELECT id FROM shop_categories WHERE slug = 'overig'), true),
    ('Bloemenvoer',          'bloemenvoer',          (SELECT id FROM shop_categories WHERE slug = 'overig'), true);

-- ===========================================================================
-- Klaar! Schema + seed voor boodschappenfunctionaliteit is aangemaakt.
-- Volgende fase: UI voor lijst-scherm (bekijken, toevoegen, afvinken).
-- ===========================================================================

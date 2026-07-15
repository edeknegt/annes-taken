-- =============================================================================
-- Anne's taken - Supabase Database Schema
-- =============================================================================
-- Categorie-schema voor Supabase (PostgreSQL).
-- Bevat tabellen, indexen, RLS policies en seed data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. CATEGORIES - Receptcategorieen
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    slug        text        NOT NULL UNIQUE,
    sort_order  integer     DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. SUBCATEGORIES - Subcategorieen, gekoppeld aan een categorie
-- ---------------------------------------------------------------------------
CREATE TABLE subcategories (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    slug        text        NOT NULL,
    category_id uuid        NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    sort_order  integer     DEFAULT 0,
    created_at  timestamptz DEFAULT now(),

    -- Slug moet uniek zijn binnen dezelfde categorie
    UNIQUE (category_id, slug)
);

CREATE INDEX idx_subcategories_category_id ON subcategories (category_id);

-- ---------------------------------------------------------------------------
-- Gedeelde trigger-functie: auto-update van updated_at bij wijzigingen.
-- Wordt (o.a.) gebruikt door shopping_items, zie supabase-shopping.sql.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- ROW LEVEL SECURITY (RLS)
-- ===========================================================================
-- RLS wordt ingeschakeld op alle tabellen. Omdat de app PIN-bescherming op
-- applicatieniveau gebruikt (met de anon key), staan we alle operaties toe
-- via permissive policies.
-- ===========================================================================

-- Categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to categories"
    ON categories FOR ALL
    USING (true)
    WITH CHECK (true);

-- Subcategories
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to subcategories"
    ON subcategories FOR ALL
    USING (true)
    WITH CHECK (true);

-- ===========================================================================
-- SEED DATA - Initiele categorieen en subcategorieen
-- ===========================================================================

-- ---- Categorieen ----
INSERT INTO categories (name, slug, sort_order) VALUES
    ('Hoofdmaaltijden',     'hoofdmaaltijden',    1),
    ('Ontbijt & Lunch',     'ontbijt-lunch',      2),
    ('Salades',             'salades',            3),
    ('Bijgerechten',        'bijgerechten',       4),
    ('Sauzen & Smaakmakers','sauzen-smaakmakers', 5),
    ('Gebak & Desserts',    'gebak',              6);

-- ---- Subcategorieen: Hoofdmaaltijden ----
INSERT INTO subcategories (name, slug, category_id, sort_order) VALUES
    ('Ovenschotels & pasta', 'ovenschotels',       (SELECT id FROM categories WHERE slug = 'hoofdmaaltijden'), 1),
    ('Rijst & curry',        'rijst-curry',        (SELECT id FROM categories WHERE slug = 'hoofdmaaltijden'), 2),
    ('Soepen',               'soepen',             (SELECT id FROM categories WHERE slug = 'hoofdmaaltijden'), 3),
    ('Wraps & plaattaarten', 'wraps-plaattaarten', (SELECT id FROM categories WHERE slug = 'hoofdmaaltijden'), 4),
    ('Eiergerechten',        'eiergerechten',      (SELECT id FROM categories WHERE slug = 'hoofdmaaltijden'), 5);

-- ---- Subcategorieen: Ontbijt & Lunch ----
INSERT INTO subcategories (name, slug, category_id, sort_order) VALUES
    ('Brood',  'brood',  (SELECT id FROM categories WHERE slug = 'ontbijt-lunch'), 1);

-- ---- Subcategorieen: Salades ----
INSERT INTO subcategories (name, slug, category_id, sort_order) VALUES
    ('Maaltijdsalades',           'maaltijdsalades',         (SELECT id FROM categories WHERE slug = 'salades'), 1),
    ('Pastasalades',              'pastasalades',            (SELECT id FROM categories WHERE slug = 'salades'), 2),
    ('Rauwkost & groentesalades', 'rauwkost-groentesalades', (SELECT id FROM categories WHERE slug = 'salades'), 3),
    ('Fruitsalades',              'fruitsalades',            (SELECT id FROM categories WHERE slug = 'salades'), 4);

-- ---- Subcategorieen: Gebak & Desserts ----
INSERT INTO subcategories (name, slug, category_id, sort_order) VALUES
    ('Taarten',  'taarten',  (SELECT id FROM categories WHERE slug = 'gebak'), 1),
    ('Cakes',    'cakes',    (SELECT id FROM categories WHERE slug = 'gebak'), 2),
    ('Koeken',   'koeken',   (SELECT id FROM categories WHERE slug = 'gebak'), 3),
    ('Desserts', 'desserts', (SELECT id FROM categories WHERE slug = 'gebak'), 4);

-- Bijgerechten en Sauzen & Smaakmakers hebben bewust geen subcategorieen (plat).

-- ===========================================================================
-- Klaar! Schema is aangemaakt met alle tabellen, indexen, de gedeelde
-- trigger-functie, RLS policies en seed data.
-- ===========================================================================

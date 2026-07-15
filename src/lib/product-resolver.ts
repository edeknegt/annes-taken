// ─────────────────────────────────────────────────────────────────────────────
// Resolver — koppelt een vrij ingredient-naam (uit recept-import of handmatig
// veld) aan een product uit de catalogus, zodat de juiste schap-categorie
// wordt gevonden in plaats van blind in "Overig" te dumpen.
//
// Strategieen (van goedkoop -> duur, eerste hit wint):
//   1. Exact match op name_normalized
//   2. Varianten exact: descriptors strippen, NL meervoud/enkelvoud/verklein-
//      vormen, klinker-collapsing (banaan↔bananen), spatie-loze vorm
//   3. Inhoud van haakjes als secundaire lookup ("tomatensaus (passata)")
//   4. Substring whole-word: product-naam komt als woordreeks in ingredient
//      voor ("laurierblad" bevat "laurier")
//   5. Compound prefix/suffix: lang enkelwoord-product is prefix of suffix
//      van samengesteld ingredient-woord ("varkenshaasmedaillons" ->
//      Varkenshaas, "kipgehakt" -> Gehakt)
//   6. Word-prefix-score: stam-varianten (chocola↔chocolade), telt unieke
//      matches per product, alleen STRIKTE winnaar wint
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

type ProductRow = {
  id: string
  name_normalized: string
  shop_category_id: string
}

type NormalizedProduct = {
  p: ProductRow
  n: string         // normalize(name_normalized)
  nNoSpace: string  // n zonder spaties — voor "balsamicoazijn" ↔ "Balsamico azijn"
}

export interface ResolvedProduct {
  productId: string
  shopCategoryId: string
}

// ─── Normalisatie ────────────────────────────────────────────────────────────

const DESCRIPTOR_WORDS = new Set([
  // Toestand/bereiding
  'rijpe', 'rijp', 'rijpere', 'verse', 'vers',
  'gedroogde', 'gedroogd', 'geraspte', 'gerasp', 'geraspt',
  'gehakte', 'gehakt', 'gepelde', 'gepeld', 'geplette', 'geplet',
  'gesneden', 'gekookte', 'gekookt', 'gebakken', 'gemalen',
  // Hoedanigheid
  'milde', 'mild', 'fijne', 'fijn', 'grove', 'grof',
  'uitgelekte', 'uitgelekt', 'ongezouten',
  'kleine', 'klein', 'grote', 'groot', 'extra',
  'pure', 'puur', 'plantaardige', 'plantaardig',
  // Verpakking / hoeveelheid-marker
  'snufje', 'snuf',
  'pak', 'pakje', 'bakje', 'blikje', 'blik', 'fles', 'flesje',
  'zakje', 'zak',
  'een', '1', 'a',
  // Eenheden — vrij-tekst ingredienten zoals "a 250 gr 's"
  'gr', 'g', 'kg', 'ml', 'l', 'el', 'tl',
  'stuk', 'stuks', 'takje', 'takjes',
])

function normalize(s: string): string {
  // NFKD decomposeert "ï" naar "i" + U+0308. Eerst combining marks weg
  // (anders worden ze door de punctuatie-strip naar spaties omgezet en wordt
  // "maïs" -> "mai s").
  let out = s.toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '')
  // Iteratief paren-content strippen — handelt ook onbalans als
  // "pak lasagnevellen ((verse) a 250 gr)".
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/\(.*?\)/g, ' ')
    if (next === out) break
    out = next
  }
  return out
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripDescriptors(s: string): string {
  return s
    .split(' ')
    .filter((w) => w && !DESCRIPTOR_WORDS.has(w) && !/^\d+(?:[.,]\d+)?$/.test(w))
    .join(' ')
}

// ─── NL-verbuigingen ─────────────────────────────────────────────────────────

const IRREGULAR_PLURALS: Record<string, string[]> = {
  ei: ['eieren'],
  kind: ['kinderen'],
  blad: ['bladen', 'bladeren'],
}
const IRREGULAR_SINGULARS: Record<string, string> = Object.fromEntries(
  Object.entries(IRREGULAR_PLURALS).flatMap(([sing, plurals]) =>
    plurals.map((p) => [p, sing]),
  ),
)

const VOWEL = /[aeiou]/
const CONS = /[bcdfghjklmnpqrstvwxz]/

// Genereert plausibele NL-verbuigingen van een woord. Eén pass — de caller
// kan herhalen (zie buildCandidates) om "uitje" → "ui" → "uien" te dekken.
function pluralVariants(s: string): string[] {
  const v = new Set<string>([s])
  if (IRREGULAR_PLURALS[s]) for (const p of IRREGULAR_PLURALS[s]) v.add(p)
  if (IRREGULAR_SINGULARS[s]) v.add(IRREGULAR_SINGULARS[s])
  if (s.length < 2) return [...v]

  // Standaard meervoudsuffixen
  v.add(s + 'en')
  v.add(s + 's')
  v.add(s + "'s")

  const last = s[s.length - 1]
  const prev = s[s.length - 2]

  // Dubbele medeklinker (perzik -> perzikken)
  if (VOWEL.test(prev) && CONS.test(last)) v.add(s + last + 'en')

  // Klinker-collapsing in meervoud (banaan -> bananen, raam -> ramen).
  // Patroon: -VVC waar beide klinkers gelijk zijn → -VCen.
  if (s.length >= 3) {
    const v1 = s[s.length - 3]
    if (v1 === prev && VOWEL.test(v1) && CONS.test(last)) {
      v.add(s.slice(0, -3) + v1 + last + 'en')
    }
  }

  // -en strippen voor enkelvoud (uien -> ui, perzikken -> perzik, peren -> peer)
  if (s.endsWith('en') && s.length >= 4) {
    const base = s.slice(0, -2)
    v.add(base)
    const a = s[s.length - 3]
    const b = s[s.length - 4]
    if (a === b) v.add(s.slice(0, -3)) // dubbel-medeklinker terug
    // Klinker-verdubbeling (peren -> peer, ramen -> raam)
    if (base.length >= 2) {
      const bLast = base[base.length - 1]
      const bPrev = base[base.length - 2]
      if (CONS.test(bLast) && VOWEL.test(bPrev)) {
        v.add(base.slice(0, -1) + bPrev + bLast)
      }
    }
  }

  // -s / -'s strippen
  if (s.endsWith("'s")) v.add(s.slice(0, -2))
  else if (s.endsWith('s') && s.length >= 3) v.add(s.slice(0, -1))

  // Verkleinvorm strippen. Genereer ZOWEL -tjes als -jes (en -tje/-je):
  // "sjalotjes" ontstaat door -jes, "worteltjes" door -tjes. Welke klopt
  // weet je niet zonder lexicon, dus probeer alletwee.
  if (s.endsWith('tjes') && s.length >= 6) v.add(s.slice(0, -4))
  if (s.endsWith('jes') && s.length >= 5) v.add(s.slice(0, -3))
  if (s.endsWith('tje') && s.length >= 5) v.add(s.slice(0, -3))
  if (s.endsWith('je') && s.length >= 4) v.add(s.slice(0, -2))

  // Spatie-loze variant ("balsamicoazijn" tegen "Balsamico azijn")
  if (s.includes(' ')) v.add(s.replace(/\s+/g, ''))

  return [...v]
}

// Verzamel candidate-strings. Past pluralVariants in twee passes toe zodat
// verkleinvorm + meervoud chained werkt: "uitje" -> "ui" -> "uien".
function buildCandidates(ingNorm: string, ingStripped: string): Set<string> {
  const cands = new Set<string>([ingNorm])
  if (ingStripped) cands.add(ingStripped)
  for (const base of [ingNorm, ingStripped]) {
    if (!base) continue
    for (const v of pluralVariants(base)) cands.add(v)
    // Plural ook op alleen het laatste woord ("rode ui" -> "rode uien")
    const parts = base.split(' ')
    if (parts.length > 1) {
      const last = parts[parts.length - 1]
      for (const v of pluralVariants(last)) {
        cands.add([...parts.slice(0, -1), v].join(' '))
      }
    }
  }
  // 2e pass voor chained transforms
  for (const c of [...cands]) {
    for (const v of pluralVariants(c)) cands.add(v)
  }
  return cands
}

// ─── Match-helpers ───────────────────────────────────────────────────────────

// Exact lookup tegen de genormaliseerde catalogus, inclusief spatie-loze
// variant zodat "balsamicoazijn" ↔ "Balsamico azijn" werkt.
function findByCandidate(
  cand: string,
  products: NormalizedProduct[],
): NormalizedProduct | undefined {
  const noSpace = cand.replace(/\s+/g, '')
  return products.find((x) => x.n === cand) || products.find((x) => x.nNoSpace === noSpace)
}

// Substring met whole-word boundary. Langste product-naam wint.
function findLongestSubstringMatch(
  haystack: string,
  products: NormalizedProduct[],
): NormalizedProduct | null {
  let best: NormalizedProduct | null = null
  for (const np of products) {
    if (np.n.length < 4) continue
    if (haystack.includes(' ' + np.n + ' ')) {
      if (!best || np.n.length > best.n.length) best = np
    }
  }
  return best
}

function ok(np: NormalizedProduct | null | undefined): ResolvedProduct | null {
  return np ? { productId: np.p.id, shopCategoryId: np.p.shop_category_id } : null
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve a free-form ingredient name to an existing product row.
 *
 * `productsCache` is optioneel — geef het mee bij batch-resolves
 * (bv. "voeg recept toe aan lijst") zodat de catalogus niet per ingredient
 * opnieuw wordt opgehaald.
 */
export async function resolveProductForIngredient(
  supabase: SupabaseClient,
  rawName: string,
  productsCache?: ProductRow[],
): Promise<ResolvedProduct | null> {
  const nameKey = rawName.trim().toLowerCase()
  if (!nameKey) return null

  // 1. Exact match (snelle DB-query, vermijdt fetch van hele catalogus)
  const { data: exact } = await supabase
    .from('products')
    .select('id, shop_category_id')
    .eq('name_normalized', nameKey)
    .maybeSingle()
  if (exact) return { productId: exact.id, shopCategoryId: exact.shop_category_id }

  // Vanaf hier alle strategieen tegen de gehele catalogus
  const products = productsCache ?? (await loadProductsCache(supabase))
  if (products.length === 0) return null

  const normalizedProducts: NormalizedProduct[] = products.map((p) => {
    const n = normalize(p.name_normalized)
    return { p, n, nNoSpace: n.replace(/\s+/g, '') }
  })

  const ingNorm = normalize(rawName)
  const ingStripped = stripDescriptors(ingNorm)

  // 2. Varianten exact (plural / diminutief / klinker-collapse / spatieloos)
  for (const cand of buildCandidates(ingNorm, ingStripped)) {
    const hit = findByCandidate(cand, normalizedProducts)
    if (hit) return ok(hit)
  }

  // 3. Inhoud van haakjes als secundaire lookup ("tomatensaus (passata)").
  // Eerst varianten exact, dan substring.
  const parensMatch = rawName.match(/\(([^()]+)\)/)
  if (parensMatch) {
    const inner = normalize(parensMatch[1])
    const innerStripped = stripDescriptors(inner)
    if (innerStripped) {
      for (const cand of buildCandidates(inner, innerStripped)) {
        const hit = findByCandidate(cand, normalizedProducts)
        if (hit) return ok(hit)
      }
      const innerHay = ' ' + (innerStripped || inner) + ' '
      const sub = findLongestSubstringMatch(innerHay, normalizedProducts)
      if (sub) return ok(sub)
    }
  }

  // 4. Substring whole-word in hele ingredient
  const haystack = ' ' + (ingStripped || ingNorm) + ' '
  const subHit = findLongestSubstringMatch(haystack, normalizedProducts)
  if (subHit) return ok(subHit)

  // 5. Compound: lang enkelwoord-product is prefix/suffix van samengesteld
  //    ingredient-woord. Min-lengtes houden korte stammen ("ui"/"sap") weg
  //    van false matches; tail >= 3 voorkomt triviale verschillen.
  const ingWordsCompound = (ingStripped || ingNorm).split(' ')
  let compBest: NormalizedProduct | null = null
  for (const np of normalizedProducts) {
    if (np.n.includes(' ')) continue
    for (const iw of ingWordsCompound) {
      const tail = iw.length - np.n.length
      if (tail < 3) continue
      const prefixOk = np.n.length >= 8 && iw.startsWith(np.n)
      const suffixOk = np.n.length >= 6 && iw.endsWith(np.n)
      if (!prefixOk && !suffixOk) continue
      if (!compBest || np.n.length > compBest.n.length) compBest = np
    }
  }
  if (compBest) return ok(compBest)

  // 6. Word-prefix-score voor stam-varianten ("chocola" -> "chocolade",
  //    "groene pesto" -> "Pesto groen"). Telt unieke ingredient-woord-
  //    matches per product. STRIKTE winnaar (liever Overig dan een gokje
  //    tussen meerdere even-goede kandidaten).
  const ingWords = (ingStripped || ingNorm).split(' ').filter((w) => w.length >= 5)
  if (ingWords.length === 0) return null

  type Cand = { p: ProductRow; matched: Set<string>; score: number }
  const byProduct = new Map<string, Cand>()
  for (const w of ingWords) {
    for (const { p, n } of normalizedProducts) {
      for (const pw of n.split(' ')) {
        if (pw.length < 5) continue
        const matches =
          (pw.startsWith(w) && pw.length - w.length <= 2) ||
          (w.startsWith(pw) && w.length - pw.length <= 2)
        if (!matches) continue
        let c = byProduct.get(p.id)
        if (!c) {
          c = { p, matched: new Set(), score: 0 }
          byProduct.set(p.id, c)
        }
        if (!c.matched.has(w)) {
          c.matched.add(w)
          c.score += Math.min(pw.length, w.length)
        }
      }
    }
  }
  const ranked = [...byProduct.values()].sort(
    (a, b) =>
      b.matched.size - a.matched.size ||
      b.score - a.score ||
      a.p.name_normalized.length - b.p.name_normalized.length,
  )
  if (ranked.length === 0) return null
  const strictWinner =
    ranked.length === 1 || ranked[0].matched.size > ranked[1].matched.size
  if (!strictWinner) return null
  return { productId: ranked[0].p.id, shopCategoryId: ranked[0].p.shop_category_id }
}

/**
 * Pre-fetcht de catalogus voor batch-resolves. Gebruik bij "voeg recept toe
 * aan lijst" zodat de loop niet N producten-queries doet.
 */
export async function loadProductsCache(
  supabase: SupabaseClient,
): Promise<ProductRow[]> {
  const { data } = await supabase
    .from('products')
    .select('id, name_normalized, shop_category_id')
  return (data as ProductRow[]) ?? []
}

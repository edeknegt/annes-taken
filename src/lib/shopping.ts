// ─────────────────────────────────────────────────────────────────────────────
// Shopping list helpers: hoeveelheid-formatting, merging, schap-categorie pills
// ─────────────────────────────────────────────────────────────────────────────

export function roundScaled(v: number): string {
  if (v < 1) return (Math.round(v * 100) / 100).toString()
  if (v < 10) return (Math.round(v * 10) / 10).toString()
  if (v < 50) return Math.round(v).toString()
  if (v < 150) return (Math.round(v / 5) * 5).toString()
  if (v < 500) return (Math.round(v / 10) * 10).toString()
  if (v < 1500) return (Math.round(v / 50) * 50).toString()
  return (Math.round(v / 100) * 100).toString()
}

export function formatAmountText(
  amount: number | null,
  unit: string | null,
  ratio: number,
): string | null {
  const u = unit?.trim() ?? ''
  if (amount === null) return u || null
  const scaled = amount * ratio
  const display = roundScaled(scaled)
  return u ? `${display} ${u}` : display
}

const AMOUNT_RE = /^(\d+(?:[.,]\d+)?)\s*(.*)$/

export function parseAmountText(
  text: string | null,
): { amount: number; unit: string; rawUnit: string } | null {
  if (!text) return null
  const m = text.trim().match(AMOUNT_RE)
  if (!m) return null
  const amount = parseFloat(m[1].replace(',', '.'))
  if (!Number.isFinite(amount)) return null
  const rawUnit = m[2].trim()
  return { amount, unit: rawUnit.toLowerCase(), rawUnit }
}

export function mergeAmountTexts(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  const pa = parseAmountText(a)
  const pb = parseAmountText(b)
  if (pa && pb && pa.unit === pb.unit) {
    const total = pa.amount + pb.amount
    return pa.rawUnit ? `${roundScaled(total)} ${pa.rawUnit}` : roundScaled(total)
  }
  return `${a} + ${b}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Pill-kleuren per schap-categorie (volledige class-strings voor Tailwind JIT)
// ─────────────────────────────────────────────────────────────────────────────
export const SHOP_CATEGORY_PILL: Record<string, string> = {
  'groente-fruit':  'bg-green-100 text-green-800',
  'zuivel':         'bg-blue-100 text-blue-800',
  'vlees-vis':      'bg-red-100 text-red-800',
  'brood-bakkerij': 'bg-amber-100 text-amber-800',
  'diepvries':      'bg-sky-100 text-sky-800',
  'pasta-rijst':    'bg-yellow-100 text-yellow-800',
  'conserven':      'bg-stone-200 text-stone-800',
  'sauzen-olie':    'bg-orange-100 text-orange-800',
  'ontbijt-beleg':  'bg-rose-100 text-rose-800',
  'snoep-koek':     'bg-pink-100 text-pink-800',
  'bakproducten':   'bg-fuchsia-100 text-fuchsia-800',
  'kruiden':        'bg-lime-100 text-lime-800',
  'dranken':        'bg-cyan-100 text-cyan-800',
  'huishouden':     'bg-slate-200 text-slate-800',
  'verzorging':     'bg-violet-100 text-violet-800',
  'overig':         'bg-gray-200 text-gray-700',
}

export function shopCategoryPillClass(slug?: string | null) {
  return SHOP_CATEGORY_PILL[slug ?? ''] ?? 'bg-gray-200 text-gray-700'
}

import type { RecurringRule } from './types'

export const DAY_OF_WEEK_OPTIONS = [
  { value: 1, short: 'ma', long: 'maandag' },
  { value: 2, short: 'di', long: 'dinsdag' },
  { value: 3, short: 'wo', long: 'woensdag' },
  { value: 4, short: 'do', long: 'donderdag' },
  { value: 5, short: 'vr', long: 'vrijdag' },
  { value: 6, short: 'za', long: 'zaterdag' },
  { value: 7, short: 'zo', long: 'zondag' },
] as const

// ISO weekday: 1=Mon..7=Sun (Date.getDay geeft 0=Sun..6=Sat)
function isoDay(d: Date): number {
  const jd = d.getDay()
  return jd === 0 ? 7 : jd
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// ─────────────────────────────────────────────────────────────────────────────
// Bepaal wanneer een regel eerstvolgend "due" is (vanaf last_triggered_at of
// vanaf vandaag als er nog geen trigger is geweest).
// ─────────────────────────────────────────────────────────────────────────────
export function nextDueAt(rule: RecurringRule, now: Date = new Date()): Date | null {
  const today = startOfDay(now)

  if (rule.rule_type === 'interval') {
    if (!rule.last_triggered_at) return today
    const last = startOfDay(new Date(rule.last_triggered_at))
    const due = new Date(last)
    due.setDate(due.getDate() + rule.interval_n)
    return due
  }

  if (rule.rule_type === 'weekly') {
    if (!rule.day_of_week) return null
    if (!rule.last_triggered_at) {
      // Eerstvolgende day_of_week vanaf vandaag
      const d = new Date(today)
      while (isoDay(d) !== rule.day_of_week) d.setDate(d.getDate() + 1)
      return d
    }
    const last = startOfDay(new Date(rule.last_triggered_at))
    const target = new Date(last)
    target.setDate(target.getDate() + rule.interval_n * 7)
    // Vangt scenario op waarin last_triggered_at op andere dag viel
    while (isoDay(target) !== rule.day_of_week) target.setDate(target.getDate() + 1)
    return target
  }

  if (rule.rule_type === 'monthly') {
    if (!rule.day_of_month) return null
    if (!rule.last_triggered_at) {
      // Deze maand op day_of_month als nog niet voorbij, anders volgende maand
      const thisMonth = new Date(today.getFullYear(), today.getMonth(), rule.day_of_month)
      if (thisMonth.getTime() >= today.getTime()) return thisMonth
      return new Date(today.getFullYear(), today.getMonth() + 1, rule.day_of_month)
    }
    const last = startOfDay(new Date(rule.last_triggered_at))
    return new Date(last.getFullYear(), last.getMonth() + rule.interval_n, rule.day_of_month)
  }

  return null
}

export function isRuleDue(rule: RecurringRule, now: Date = new Date()): boolean {
  if (!rule.active) return false
  const due = nextDueAt(rule, now)
  if (!due) return false
  return startOfDay(due).getTime() <= startOfDay(now).getTime()
}

// ─────────────────────────────────────────────────────────────────────────────
// Leesbare beschrijving van een regel, bijv. "elke 2 weken op maandag".
// ─────────────────────────────────────────────────────────────────────────────
export function describeRule(rule: RecurringRule): string {
  if (rule.rule_type === 'interval') {
    return rule.interval_n === 1 ? 'elke dag' : `elke ${rule.interval_n} dagen`
  }
  if (rule.rule_type === 'weekly') {
    const day = DAY_OF_WEEK_OPTIONS.find(d => d.value === rule.day_of_week)?.long ?? ''
    if (!day) return ''
    return rule.interval_n === 1 ? `elke ${day}` : `elke ${rule.interval_n} weken op ${day}`
  }
  if (rule.rule_type === 'monthly') {
    const d = rule.day_of_month
    if (!d) return ''
    const ordinal = d === 1 ? '1e' : d === 8 ? '8e' : `${d}e`
    return rule.interval_n === 1
      ? `elke maand op de ${ordinal}`
      : `elke ${rule.interval_n} maanden op de ${ordinal}`
  }
  return ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Menselijke datumafstand, bijv. "vandaag", "gisteren", "3 dagen geleden".
// ─────────────────────────────────────────────────────────────────────────────
export function describeRelativeDate(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'nog nooit'
  const d = startOfDay(new Date(iso))
  const today = startOfDay(now)
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'vandaag'
  if (diffDays === 1) return 'gisteren'
  if (diffDays > 0) return `${diffDays} dagen geleden`
  if (diffDays === -1) return 'morgen'
  return `over ${-diffDays} dagen`
}

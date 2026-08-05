import type { RecurUnit, ShiftType, TaskRule } from './types'

export const MONTH_OPTIONS = [
  { value: 1, long: 'januari' },
  { value: 2, long: 'februari' },
  { value: 3, long: 'maart' },
  { value: 4, long: 'april' },
  { value: 5, long: 'mei' },
  { value: 6, long: 'juni' },
  { value: 7, long: 'juli' },
  { value: 8, long: 'augustus' },
  { value: 9, long: 'september' },
  { value: 10, long: 'oktober' },
  { value: 11, long: 'november' },
  { value: 12, long: 'december' },
] as const

export const SHIFT_TYPE_LABEL: Record<ShiftType, string> = {
  dienst: 'Dienst',
  spreekuur: 'Spreekuur',
}

// Verjaardagen worden dit aantal dagen vóór de daadwerkelijke datum als taak
// opgevoerd, zodat er nog tijd is om een cadeau te regelen.
const BIRTHDAY_LEAD_DAYS = 14

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addUnits(date: Date, unit: RecurUnit, n: number): Date {
  const d = new Date(date)
  if (unit === 'day') d.setDate(d.getDate() + n)
  else if (unit === 'week') d.setDate(d.getDate() + n * 7)
  else d.setMonth(d.getMonth() + n)
  return d
}

export function formatDayMonth(day: number, month: number): string {
  const long = MONTH_OPTIONS.find(m => m.value === month)?.long ?? ''
  return long ? `${day} ${long}` : ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Bepaal wanneer een regel eerstvolgend "due" is.
//   fixed            -> vaste cadans vanaf het moment van materialiseren
//                       (last_triggered_at), los van of de vorige taak is
//                       afgevinkt. Vóór de eerste materialisatie geldt een
//                       optionele first_due_at (anders: meteen due).
//   after_completion -> N eenheden na het afvinken van de vorige taak
//                       (last_triggered_at wordt dan gezet op het afvink-
//                       moment, niet op materialisatie-moment). Vóór de
//                       eerste afgevinkte taak geldt first_due_at.
//   yearly           -> jaarlijkse datum (dag+maand), 14 dagen van tevoren.
//   workday          -> eenmalige Dienst/Spreekuur op first_due_at. Wordt na
//                       materialiseren gedeactiveerd (geen herhaling), maar
//                       blijft als historie staan t.b.v. 'after_workday'.
//   after_workday    -> taak verschijnt op de laatst gelogde werkdag zelf
//                       (Dienst/Spreekuur), geen eigen datum of interval
//                       nodig — die volgt uit de meest recente workday-regel,
//                       meegegeven via `latestWorkdayDate`.
// ─────────────────────────────────────────────────────────────────────────────
export function nextDueAt(
  rule: TaskRule,
  now: Date = new Date(),
  latestWorkdayDate: Date | null = null
): Date | null {
  const today = startOfDay(now)

  if (rule.rule_type === 'fixed') {
    if (!rule.recur_unit) return null
    if (!rule.last_triggered_at) {
      return rule.first_due_at ? startOfDay(new Date(rule.first_due_at)) : today
    }
    const last = startOfDay(new Date(rule.last_triggered_at))
    return addUnits(last, rule.recur_unit, rule.interval_n)
  }

  if (rule.rule_type === 'after_completion') {
    if (!rule.recur_unit) return null
    if (!rule.last_triggered_at) {
      return rule.first_due_at ? startOfDay(new Date(rule.first_due_at)) : today
    }
    const last = startOfDay(new Date(rule.last_triggered_at))
    return addUnits(last, rule.recur_unit, rule.interval_n)
  }

  if (rule.rule_type === 'yearly') {
    if (!rule.month || !rule.day_of_month) return null

    if (!rule.last_triggered_at) {
      // Vergelijk met de verjaardag zelf, niet met de (al -14 dagen
      // verschoven) due-datum — anders wordt een verjaardag die binnen de
      // lead time ligt (bv. over 12 dagen) onterecht als "al gehad" gezien
      // en pas volgend jaar weer opgevoerd, in plaats van meteen.
      const birthdayThisYear = new Date(today.getFullYear(), rule.month - 1, rule.day_of_month)
      if (birthdayThisYear.getTime() >= today.getTime()) {
        const dueThisYear = new Date(birthdayThisYear)
        dueThisYear.setDate(dueThisYear.getDate() - BIRTHDAY_LEAD_DAYS)
        return dueThisYear
      }
      const dueNextYear = new Date(today.getFullYear() + 1, rule.month - 1, rule.day_of_month)
      dueNextYear.setDate(dueNextYear.getDate() - BIRTHDAY_LEAD_DAYS)
      return dueNextYear
    }

    const last = startOfDay(new Date(rule.last_triggered_at))
    const due = new Date(last.getFullYear() + 1, rule.month - 1, rule.day_of_month)
    due.setDate(due.getDate() - BIRTHDAY_LEAD_DAYS)
    return due
  }

  if (rule.rule_type === 'workday') {
    if (!rule.first_due_at) return null
    return startOfDay(new Date(rule.first_due_at))
  }

  if (rule.rule_type === 'after_workday') {
    if (!latestWorkdayDate) return null
    const anchor = startOfDay(latestWorkdayDate)
    // Al gematerialiseerd voor deze (of een latere) werkdag — wacht op een
    // nieuwe, nog niet verwerkte werkdag voordat dit weer due wordt.
    if (rule.last_triggered_at && startOfDay(new Date(rule.last_triggered_at)).getTime() >= anchor.getTime()) {
      return null
    }
    return anchor
  }

  return null
}

export function isRuleDue(
  rule: TaskRule,
  now: Date = new Date(),
  latestWorkdayDate: Date | null = null
): boolean {
  if (!rule.active) return false
  const due = nextDueAt(rule, now, latestWorkdayDate)
  if (!due) return false
  return startOfDay(due).getTime() <= startOfDay(now).getTime()
}

// ─────────────────────────────────────────────────────────────────────────────
// Leesbare beschrijving van een regel, bijv. "elke 2 weken" of
// "3 dagen na afvinken vorige taak".
// ─────────────────────────────────────────────────────────────────────────────
function unitWord(unit: RecurUnit, n: number): string {
  if (unit === 'day') return n === 1 ? 'dag' : 'dagen'
  if (unit === 'week') return n === 1 ? 'week' : 'weken'
  return n === 1 ? 'maand' : 'maanden'
}

export function describeRule(rule: TaskRule): string {
  if (rule.rule_type === 'fixed') {
    if (!rule.recur_unit) return ''
    return rule.interval_n === 1
      ? `elke ${unitWord(rule.recur_unit, 1)}`
      : `elke ${rule.interval_n} ${unitWord(rule.recur_unit, rule.interval_n)}`
  }
  if (rule.rule_type === 'after_completion') {
    if (!rule.recur_unit) return ''
    return `${rule.interval_n} ${unitWord(rule.recur_unit, rule.interval_n)} na afvinken vorige taak`
  }
  if (rule.rule_type === 'after_workday') {
    return 'op werkdag'
  }
  if (rule.rule_type === 'yearly') {
    if (!rule.day_of_month || !rule.month) return ''
    return formatDayMonth(rule.day_of_month, rule.month)
  }
  if (rule.rule_type === 'workday') {
    if (!rule.first_due_at) return ''
    const d = new Date(rule.first_due_at)
    return formatDayMonth(d.getDate(), d.getMonth() + 1)
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

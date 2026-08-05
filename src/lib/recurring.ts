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

// Zondag is de eerste dag van de week (zie ook de weekdag-conventie elders
// in de app).
export const WEEKDAY_OPTIONS = [
  { value: 0, label: 'zondag' },
  { value: 1, label: 'maandag' },
  { value: 2, label: 'dinsdag' },
  { value: 3, label: 'woensdag' },
  { value: 4, label: 'donderdag' },
  { value: 5, label: 'vrijdag' },
  { value: 6, label: 'zaterdag' },
] as const

// 'Vast patroon' op maandbasis gebruikt alleen dag 1-28, zodat elke maand
// (ook februari) die dag daadwerkelijk heeft.
export const FIXED_DAY_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1)

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

// Eerstvolgende keer dat `from` (of een latere dag) op weekdag `weekday`
// valt (0 = zondag .. 6 = zaterdag) — vandaag zelf telt mee.
function nextWeekday(from: Date, weekday: number): Date {
  const d = startOfDay(from)
  const diff = (weekday - d.getDay() + 7) % 7
  d.setDate(d.getDate() + diff)
  return d
}

// Eerstvolgende keer dat `from` (of een latere dag) op dag-van-de-maand
// `dayOfMonth` valt — vandaag zelf telt mee, anders schuift 'ie door naar
// dezelfde dag volgende maand.
function nextDayOfMonth(from: Date, dayOfMonth: number): Date {
  const d = startOfDay(from)
  const candidate = new Date(d.getFullYear(), d.getMonth(), dayOfMonth)
  if (candidate.getTime() >= d.getTime()) return candidate
  return new Date(d.getFullYear(), d.getMonth() + 1, dayOfMonth)
}

export function formatDayMonth(day: number, month: number): string {
  const long = MONTH_OPTIONS.find(m => m.value === month)?.long ?? ''
  return long ? `${day} ${long}` : ''
}

export function formatDayMonthYear(day: number, month: number, year: number): string {
  const base = formatDayMonth(day, month)
  return base ? `${base} ${year}` : ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Bepaal wanneer een regel eerstvolgend "due" is.
//   fixed            -> vast patroon: elke N dag/week/maand, optioneel op
//                       een specifieke weekdag (week) of dag-van-de-maand
//                       (maand, 1-28). Bij N=1 is er geen ankerdatum nodig —
//                       due = eerstvolgende keer dat het patroon optreedt.
//                       Bij N>1 is first_due_at het startpunt: de echte
//                       eerste keer is de eerstvolgende datum op of na die
//                       datum die daadwerkelijk op de gekozen weekdag/dag-
//                       van-de-maand valt (first_due_at hoeft dus zelf niet
//                       op die dag te vallen). Na de eerste materialisatie
//                       (via last_triggered_at) volgt het patroon zichzelf.
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

    if (rule.last_triggered_at) {
      // Eenmaal aan de gang, houdt +N eenheden het patroon vanzelf aan (bv.
      // +1 week landt automatisch weer op dezelfde weekdag).
      const last = startOfDay(new Date(rule.last_triggered_at))
      return addUnits(last, rule.recur_unit, rule.interval_n)
    }

    if (rule.interval_n > 1) {
      // "Elke N ...": zonder ankerdatum is niet te bepalen welke van de
      // N-cyclus de eerste moet zijn — first_due_at is leidend, maar bepaalt
      // alleen het startpunt. De echte eerste keer is de eerstvolgende datum
      // ná (of op) die datum die daadwerkelijk in het patroon valt (bv. de
      // eerste zondag op of na een ingevulde woensdag).
      const anchor = rule.first_due_at ? startOfDay(new Date(rule.first_due_at)) : today
      if (rule.recur_unit === 'week' && rule.weekday != null) {
        return nextWeekday(anchor, rule.weekday)
      }
      if (rule.recur_unit === 'month' && rule.day_of_month != null) {
        return nextDayOfMonth(anchor, rule.day_of_month)
      }
      return anchor
    }

    if (rule.recur_unit === 'week' && rule.weekday != null) {
      return nextWeekday(today, rule.weekday)
    }
    if (rule.recur_unit === 'month' && rule.day_of_month != null) {
      return nextDayOfMonth(today, rule.day_of_month)
    }
    // Geen weekdag/dag-van-de-maand gekozen (bv. 'day'-eenheid, of een
    // regel van vóór deze functie zonder patroon) — val terug op
    // first_due_at als die gezet is, anders meteen due.
    return rule.first_due_at ? startOfDay(new Date(rule.first_due_at)) : today
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
    const base = rule.interval_n === 1
      ? `elke ${unitWord(rule.recur_unit, 1)}`
      : `elke ${rule.interval_n} ${unitWord(rule.recur_unit, rule.interval_n)}`
    if (rule.recur_unit === 'week' && rule.weekday != null) {
      return `${base} op ${WEEKDAY_OPTIONS[rule.weekday].label}`
    }
    if (rule.recur_unit === 'month' && rule.day_of_month != null) {
      return `${base} op de ${rule.day_of_month}e`
    }
    return base
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
    return formatDayMonthYear(d.getDate(), d.getMonth() + 1, d.getFullYear())
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

// ─────────────────────────────────────────────────────────────────────────────
// Vaste, niet-aanpasbare cadeau-herinneringen (Vaderdag/Moederdag).
// Deze passen niet in de normale task_rules-flow omdat hun datum jaarlijks
// verschuift (Nde zondag van de maand i.p.v. een vaste dag), dus staan ze
// hier hardcoded. Voortgang (wanneer voor het laatst gematerialiseerd) wordt
// per key bijgehouden in de gift_holiday_triggers-tabel.
// ─────────────────────────────────────────────────────────────────────────────

export interface HardcodedGiftTask {
  key: string
  name: string
  description: string
  computeDate: (year: number) => Date
}

function nthSundayOfMonth(year: number, month: number, n: number): Date {
  const d = new Date(year, month - 1, 1)
  let sundays = 0
  while (true) {
    if (d.getDay() === 0) {
      sundays++
      if (sundays === n) return new Date(d)
    }
    d.setDate(d.getDate() + 1)
  }
}

// Moederdag (NL): 2e zondag van mei. Vaderdag (NL): 3e zondag van juni.
const moederdag = (year: number) => nthSundayOfMonth(year, 5, 2)
const vaderdag = (year: number) => nthSundayOfMonth(year, 6, 3)

const VADERDAG_DESC = '3e zondag van juni'
const MOEDERDAG_DESC = '2e zondag van mei'

export const HARDCODED_GIFT_TASKS: HardcodedGiftTask[] = [
  { key: 'vaderdag-pa-kardux', name: 'Vaderdag pa Kardux', description: VADERDAG_DESC, computeDate: vaderdag },
  { key: 'vaderdag-pa-de-knegt', name: 'Vaderdag pa de Knegt', description: VADERDAG_DESC, computeDate: vaderdag },
  { key: 'moederdag-ma-kardux', name: 'Moederdag ma Kardux', description: MOEDERDAG_DESC, computeDate: moederdag },
  { key: 'moederdag-ma-de-knegt', name: 'Moederdag ma de Knegt', description: MOEDERDAG_DESC, computeDate: moederdag },
]

// Zelfde voorsprong als bij verjaardagen: 14 dagen van tevoren als taak tonen.
const LEAD_DAYS = 14

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function nextDueAtForHardcoded(
  computeDate: (year: number) => Date,
  lastTriggeredAt: string | null,
  now: Date = new Date()
): Date {
  const today = startOfDay(now)

  if (!lastTriggeredAt) {
    const dueThisYear = computeDate(today.getFullYear())
    dueThisYear.setDate(dueThisYear.getDate() - LEAD_DAYS)
    if (dueThisYear.getTime() >= today.getTime()) return dueThisYear
    const dueNextYear = computeDate(today.getFullYear() + 1)
    dueNextYear.setDate(dueNextYear.getDate() - LEAD_DAYS)
    return dueNextYear
  }

  const last = startOfDay(new Date(lastTriggeredAt))
  const due = computeDate(last.getFullYear() + 1)
  due.setDate(due.getDate() - LEAD_DAYS)
  return due
}

export function isHardcodedDue(
  computeDate: (year: number) => Date,
  lastTriggeredAt: string | null,
  now: Date = new Date()
): boolean {
  const due = nextDueAtForHardcoded(computeDate, lastTriggeredAt, now)
  return startOfDay(due).getTime() <= startOfDay(now).getTime()
}

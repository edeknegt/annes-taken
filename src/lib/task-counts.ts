'use client'

import type { TaskCategory } from './types'

// Gedeelde, live bijgehouden telling van openstaande (niet-afgevinkte) taken
// per categorie — gebruikt voor het rode aantal-badge op de nav-tabs (net als
// een app-badge op het iPhone-homescreen). Elke [category]-pagina rapporteert
// zijn eigen, actuele aantal zodra de taken daar geladen of gewijzigd zijn;
// de Sidebar doet daarnaast één keer een globale telling bij het opstarten
// zodat ook nog-niet-bezochte tabs meteen een correct aantal tonen.
type Counts = Partial<Record<TaskCategory, number>>

const subscribers = new Set<() => void>()
const EMPTY_SNAPSHOT: Counts = Object.freeze({})

let snapshot: Counts = {}

function emit() {
  for (const fn of subscribers) fn()
}

export function setTaskCount(category: TaskCategory, count: number) {
  if (snapshot[category] === count) return
  snapshot = { ...snapshot, [category]: count }
  emit()
}

export function setAllTaskCounts(counts: Counts) {
  snapshot = { ...snapshot, ...counts }
  emit()
}

export function subscribeTaskCounts(fn: () => void) {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

export function getTaskCountsSnapshot(): Counts {
  return snapshot
}

export function getServerSnapshot(): Counts {
  return EMPTY_SNAPSHOT
}

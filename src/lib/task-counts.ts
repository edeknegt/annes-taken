'use client'

// Gedeelde, live bijgehouden telling van openstaande (niet-afgevinkte) taken
// die vandaag gepland staan — gebruikt voor het rode aantal-badge op de
// Vandaag-nav-tab (net als een app-badge op het iPhone-homescreen). De
// Vandaag-pagina rapporteert dit live zodra de lijst daar laadt of wijzigt;
// de Sidebar doet daarnaast één keer een globale telling bij het opstarten
// zodat het badge ook klopt als je start op een andere pagina (bv. Beheer).
const subscribers = new Set<() => void>()

let snapshot = 0

function emit() {
  for (const fn of subscribers) fn()
}

export function setTodayCount(count: number) {
  if (snapshot === count) return
  snapshot = count
  emit()
}

export function subscribeTodayCount(fn: () => void) {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

export function getTodayCountSnapshot(): number {
  return snapshot
}

export function getServerSnapshot(): number {
  return 0
}

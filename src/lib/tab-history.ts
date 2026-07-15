'use client'

export type TabKey = 'home' | 'lijst' | 'instellingen'

const STORAGE_KEY = 'tab-history-v1'

type State = Partial<Record<TabKey, string>>

const subscribers = new Set<() => void>()

function readStorage(): State {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as State) : {}
  } catch {
    return {}
  }
}

const EMPTY_SNAPSHOT: State = Object.freeze({})

let snapshot: State = readStorage()

function writeStorage(next: State) {
  snapshot = next
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {}
  for (const fn of subscribers) fn()
}

export function setTabPath(tab: TabKey, path: string) {
  if (snapshot[tab] === path) return
  writeStorage({ ...snapshot, [tab]: path })
}

export function subscribeTabHistory(fn: () => void) {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

export function getTabHistorySnapshot(): State {
  return snapshot
}

export function getServerSnapshot(): State {
  return EMPTY_SNAPSHOT
}

export function detectTab(pathname: string): TabKey | null {
  if (pathname === '/') return 'home'
  if (pathname.startsWith('/lijst')) return 'lijst'
  if (pathname.startsWith('/categorieen')) return 'instellingen'
  return null
}

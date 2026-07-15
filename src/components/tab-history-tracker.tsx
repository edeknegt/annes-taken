'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { detectTab, setTabPath } from '@/lib/tab-history'

function TabHistoryTrackerInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const tab = detectTab(pathname)
    if (!tab) return
    const qs = searchParams.toString()
    setTabPath(tab, qs ? `${pathname}?${qs}` : pathname)
  }, [pathname, searchParams])

  return null
}

export function TabHistoryTracker() {
  return (
    <Suspense fallback={null}>
      <TabHistoryTrackerInner />
    </Suspense>
  )
}

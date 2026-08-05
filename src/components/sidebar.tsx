'use client'

import { useRef, useState, useLayoutEffect, useEffect, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Home, Briefcase, ShoppingBag, Gift, CircleEllipsis } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type TabKey,
  getServerSnapshot,
  getTabHistorySnapshot,
  subscribeTabHistory,
} from '@/lib/tab-history'

type NavItem = {
  tab: TabKey
  label: string
  href: string
  icon: typeof Home
}

const navItems: NavItem[] = [
  { tab: 'huishouden', label: 'Huishouden', href: '/huishouden', icon: Home },
  { tab: 'werk', label: 'Werk', href: '/werk', icon: Briefcase },
  { tab: 'inkopen', label: 'Inkopen', href: '/inkopen', icon: ShoppingBag },
  { tab: 'cadeaus', label: 'Cadeaus', href: '/cadeaus', icon: Gift },
  { tab: 'overig', label: 'Overig', href: '/overig', icon: CircleEllipsis },
]

export function Sidebar() {
  const pathname = usePathname()
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  const tabHistory = useSyncExternalStore(
    subscribeTabHistory,
    getTabHistorySnapshot,
    getServerSnapshot,
  )

  const isActive = (item: NavItem) => {
    if (item.href === '/') return pathname === '/'
    return pathname.startsWith(item.href)
  }

  // Op de actieve tab altijd naar de root van die tab linken (zodat opnieuw
  // tikken terugspringt naar de lijst), op andere tabs naar de laatst-bezochte
  // deep path zodat je terugkomt waar je was (incl. filters of recept-detail).
  const hrefFor = (item: NavItem) => {
    if (isActive(item)) return item.href
    return tabHistory[item.tab] ?? item.href
  }

  const activeIndex = navItems.findIndex(isActive)

  useLayoutEffect(() => {
    const measure = () => {
      const el = itemRefs.current[activeIndex]
      const parent = el?.parentElement
      if (!el || !parent) return
      const parentRect = parent.getBoundingClientRect()
      const rect = el.getBoundingClientRect()
      setPill({ left: rect.left - parentRect.left, width: rect.width })
    }
    measure()
  }, [activeIndex])

  useEffect(() => {
    const onResize = () => {
      const el = itemRefs.current[activeIndex]
      const parent = el?.parentElement
      if (!el || !parent) return
      const parentRect = parent.getBoundingClientRect()
      const rect = el.getBoundingClientRect()
      setPill({ left: rect.left - parentRect.left, width: rect.width })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [activeIndex])

  return (
    <>
      {/* Mobile: fade achter en onder de pill — geeft content 'doorzichtig'-effect.
          Wordt verborgen als er een bottom-sheet open staat (zie globals.css). */}
      <div
        aria-hidden
        className="nav-fade lg:hidden fixed left-0 right-0 bottom-0 z-30 pointer-events-none h-28 bg-gradient-to-t from-mint-100/80 via-mint-100/40 to-transparent"
      />

      {/* Mobile bottom navigation bar (floating pill, WhatsApp-style) */}
      <nav
        className="mobile-nav lg:hidden fixed left-3 right-3 z-40 rounded-full bg-white/85 backdrop-blur-md border border-gray-200 shadow-lg shadow-mint-900/20"
        style={{ bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 0.5rem) + var(--keyboard-inset, 0px))' }}
      >
        <div className="relative flex items-stretch justify-around h-14 px-1">
          {pill && (
            <span
              aria-hidden
              className="absolute top-1.5 bottom-1.5 left-0 rounded-full bg-mint-200 pointer-events-none"
              style={{
                width: pill.width,
                transform: `translate3d(${pill.left}px, 0, 0)`,
                transition:
                  'transform 550ms cubic-bezier(0.34, 1.7, 0.5, 1), width 550ms cubic-bezier(0.34, 1.7, 0.5, 1)',
                willChange: 'transform, width',
              }}
            />
          )}
          {navItems.map((item, i) => {
            const Icon = item.icon
            const active = isActive(item)
            return (
              <Link
                key={item.tab}
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                href={hrefFor(item)}
                className={cn(
                  'relative z-10 flex flex-col items-center justify-center gap-0.5 flex-1 mx-0.5 rounded-full py-1.5 transition-colors',
                  active ? 'text-mint-800' : 'text-gray-500'
                )}
              >
                <Icon className="h-4 w-4" />
                <span
                  className={cn(
                    'text-[8.5px] leading-[1.1] text-center px-0.5',
                    active ? 'font-bold' : 'font-medium'
                  )}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 bg-white border-r border-gray-200">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-mint-300 shrink-0">
            <Image src="/logo.png" alt="Anne&apos;s taken" width={40} height={40} className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Anne&apos;s taken</h1>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item)
            return (
              <Link
                key={item.tab}
                href={hrefFor(item)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-mint-500 text-mint-950'
                    : 'text-gray-600 hover:bg-mint-50 hover:text-gray-900'
                )}
              >
                <Icon className={cn('h-5 w-5', active ? 'text-mint-950' : 'text-gray-400')} />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>
    </>
  )
}

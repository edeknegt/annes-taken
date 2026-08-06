import Link from 'next/link'
import { Home, Briefcase, ShoppingBag, Gift, MessageSquare, CircleEllipsis, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TASK_CATEGORIES } from '@/lib/tasks'
import type { TaskCategory } from '@/lib/types'

const ICONS: Record<TaskCategory, typeof Home> = {
  huishouden: Home,
  werk: Briefcase,
  inkopen: ShoppingBag,
  cadeaus: Gift,
  berichten: MessageSquare,
  overig: CircleEllipsis,
}

export default function BeheerIndexPage() {
  return (
    <div className="max-w-2xl mx-auto pt-4 sm:pt-6 lg:pt-8 pb-24">
      <h1 className="page-title mb-4">Beheer</h1>
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {TASK_CATEGORIES.map((c, i) => {
          const Icon = ICONS[c.value]
          return (
            <Link
              key={c.value}
              href={`/beheer/${c.value}`}
              className={cn('flex items-center gap-3 px-4 py-3.5', i > 0 && 'border-t border-gray-100')}
            >
              <Icon className="h-5 w-5 text-mint-600 shrink-0" />
              <span className="flex-1 text-[15px] text-gray-900">{c.label}</span>
              <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

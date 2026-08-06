'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { TaskRulesPanel } from '@/components/task-rules-panel'
import { TASK_CATEGORIES, taskCategoryLabel } from '@/lib/tasks'
import type { TaskCategory } from '@/lib/types'

const VALID_CATEGORIES = TASK_CATEGORIES.map(c => c.value)

export function BeheerPageClient() {
  const router = useRouter()
  const params = useParams<{ category: string }>()
  const category = params.category as TaskCategory
  const isWerk = category === 'werk'
  const [section, setSection] = useState<'rules' | 'workdays'>('rules')

  // Terug naar "Taakregels" bij het wisselen van thema — anders blijft de
  // "Werkdagen"-subtab van het vorige thema hangen.
  useEffect(() => {
    setSection('rules')
  }, [category])

  useEffect(() => {
    if (!VALID_CATEGORIES.includes(category)) {
      router.replace('/beheer')
    }
  }, [category, router])

  if (!VALID_CATEGORIES.includes(category)) return null

  return (
    <div className="max-w-2xl mx-auto">
      {/* Fixed header */}
      <div className="fixed top-0 left-0 right-0 lg:left-64 z-20 bg-mint-100 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <h1 className="page-title truncate">{taskCategoryLabel(category)}</h1>
        </div>

        {isWerk && (
          <div className="max-w-2xl mx-auto mt-3 flex gap-1 bg-white/70 border border-gray-200 rounded-full p-1 w-fit">
            {(['rules', 'workdays'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                  section === s ? 'bg-mint-500 text-mint-950' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {s === 'rules' ? 'Taakregels' : 'Werkdagen'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Spacer onder fixed header */}
      <div className={cn(isWerk ? 'h-32 sm:h-36 lg:h-40' : 'h-20 sm:h-24 lg:h-28')} aria-hidden />

      <div className="pb-24">
        <TaskRulesPanel category={category} section={section} />
      </div>
    </div>
  )
}

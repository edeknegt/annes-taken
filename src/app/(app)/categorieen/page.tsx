'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CategoriesPanel } from './categories-panel'
import { RecurringRulesPanel } from './recurring-rules-panel'

type Tab = 'categorieen' | 'herhaling'

export default function InstellingenPage() {
  const [tab, setTab] = useState<Tab>('categorieen')

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4 bg-mint-100">
        <h1 className="page-title">Instellingen</h1>

        {/* Segmented control (Apple-stijl) */}
        <div className="mt-4 inline-flex items-center bg-gray-200/70 rounded-full p-0.5 w-full sm:w-auto">
          <TabButton active={tab === 'categorieen'} onClick={() => setTab('categorieen')}>
            Receptcategorie&euml;n
          </TabButton>
          <TabButton active={tab === 'herhaling'} onClick={() => setTab('herhaling')}>
            Boodschappenregels
          </TabButton>
        </div>
      </div>

      {tab === 'categorieen' ? <CategoriesPanel /> : <RecurringRulesPanel />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 sm:flex-initial px-4 py-1.5 rounded-full text-sm font-medium transition-all touch-manipulation',
        active
          ? 'bg-white shadow-sm text-gray-900'
          : 'text-gray-600 hover:text-gray-800'
      )}
    >
      {children}
    </button>
  )
}

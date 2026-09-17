'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, X, CalendarClock } from 'lucide-react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { TASK_CATEGORIES, CATEGORY_BADGE_CLASS, CATEGORY_ICON, taskCategoryLabel } from '@/lib/tasks'
import type { TaskCategory, TaskRule } from '@/lib/types'

// Een geplande taak is een task_rule met rule_type 'once': op de ingestelde
// datum maakt de Taken-pagina er automatisch een taak van in Vandaag, en de
// dag ervoor staat hij alvast in Snel. Dit is de enige plek waar zulke
// eenmalige taken worden gemaakt — Beheer gaat alleen over regels die zich
// blijven herhalen.

const DEFAULT_CATEGORY: TaskCategory = 'huishouden'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "vrijdag 2 oktober" — zonder jaartal, tenzij het een ander jaar is dan nu.
function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

interface PlannedForm {
  id: string | null
  name: string
  date: string
  category: TaskCategory
}

function emptyForm(): PlannedForm {
  return { id: null, name: '', date: todayIso(), category: DEFAULT_CATEGORY }
}

export default function GeplandPage() {
  const supabase = createClient()
  const [rules, setRules] = useState<TaskRule[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState<PlannedForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<TaskRule | null>(null)

  const fetchRules = useCallback(async () => {
    // Alleen nog niet ingelost: zodra een geplande taak in Vandaag staat,
    // zet de Taken-pagina de regel op inactief en verdwijnt hij hier.
    const { data } = await supabase
      .from('task_rules')
      .select('*')
      .eq('rule_type', 'once')
      .eq('active', true)
      .order('first_due_at')
    setRules((data as TaskRule[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const openNew = () => {
    setForm(emptyForm())
    setEditorOpen(true)
  }

  const openEdit = (rule: TaskRule) => {
    setForm({
      id: rule.id,
      name: rule.name,
      date: (rule.first_due_at ?? todayIso()).slice(0, 10),
      category: rule.category,
    })
    setEditorOpen(true)
  }

  const save = async () => {
    const name = form.name.trim()
    if (!name || !form.date) return
    setSaving(true)

    const payload = {
      category: form.category,
      name,
      description: null,
      rule_type: 'once' as const,
      interval_n: 1,
      recur_unit: null,
      first_due_at: form.date,
      day_of_month: null,
      weekday: null,
      month: null,
      birth_year: null,
      shift_type: null,
      gift: true,
      card: true,
      active: true,
    }

    if (form.id) {
      await supabase.from('task_rules').update(payload).eq('id', form.id)
    } else {
      await supabase.from('task_rules').insert(payload)
    }

    setSaving(false)
    setEditorOpen(false)
    fetchRules()
  }

  const remove = async () => {
    if (!deleteConfirm) return
    await supabase.from('task_rules').delete().eq('id', deleteConfirm.id)
    setRules(prev => prev.filter(r => r.id !== deleteConfirm.id))
    setDeleteConfirm(null)
  }

  const today = todayIso()

  return (
    <div className="max-w-2xl mx-auto">
      {/* Fixed header — zelfde patroon als Taken en Beheer. */}
      <div className="fixed top-0 left-0 right-0 lg:left-64 z-20 bg-mint-100 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="page-title truncate">Gepland</h1>
        </div>
      </div>

      {/* Spacer onder fixed header */}
      <div className="h-20 sm:h-24 lg:h-28" aria-hidden />

      <div className="pb-24">
        {loading ? (
          <p className="text-sm text-gray-400">Laden&hellip;</p>
        ) : rules.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-12 text-center">
            <CalendarClock className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4">
              Nog niets gepland. Een geplande taak staat de dag ervoor al in Snel, en op de dag zelf in Vandaag.
            </p>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />
              Eerste taak inplannen
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {rules.map((rule, i) => {
              const Icon = CATEGORY_ICON[rule.category]
              const date = (rule.first_due_at ?? '').slice(0, 10)
              const overdue = date < today
              return (
                <div
                  key={rule.id}
                  className={cn('flex items-center gap-2 pl-3 pr-1', i > 0 && 'border-t border-gray-100')}
                >
                  <button
                    type="button"
                    onClick={() => openEdit(rule)}
                    className="flex-1 min-w-0 py-2.5 text-left"
                  >
                    <span className="block truncate text-[15px] text-gray-900">{rule.name}</span>
                    <span
                      className={cn(
                        'block text-[11px] mt-0.5',
                        overdue ? 'text-red-500 font-medium' : 'text-gray-500'
                      )}
                    >
                      {formatLongDate(date)}
                    </span>
                  </button>

                  <span
                    className={cn(
                      'flex items-center justify-center h-6 w-6 rounded-full shrink-0',
                      CATEGORY_BADGE_CLASS[rule.category]
                    )}
                    title={taskCategoryLabel(rule.category)}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>

                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(rule)}
                    className="flex items-center justify-center p-3 text-gray-300 hover:text-red-500 shrink-0"
                    aria-label="Verwijderen"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Editor: naam, dag en categorie — meer is er niet nodig. */}
      <BottomSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={form.id ? 'Geplande taak' : 'Taak inplannen'}
      >
        <div className="space-y-4">
          <Input
            label="Taak"
            value={form.name}
            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Bijv. Belastingaangifte invullen"
          />

          {/* Zelfde opzet als de datumvelden in Beheer: een date-input heeft een
              eigen minimumbreedte en loopt buiten het scherm zonder wrapper met
              overflow-hidden en min-w-0. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
            <div className="rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-mint-200 focus-within:border-mint-500">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))}
                className="block w-full min-w-0 px-3 py-2 text-sm bg-transparent outline-none"
              />
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1">Categorie</span>
            <div className="grid grid-cols-2 gap-1.5">
              {TASK_CATEGORIES.map(c => {
                const Icon = CATEGORY_ICON[c.value]
                const selected = form.category === c.value
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, category: c.value }))}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                      selected ? 'bg-mint-500 text-mint-950' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    <span
                      className={cn(
                        'flex items-center justify-center h-6 w-6 rounded-full shrink-0',
                        CATEGORY_BADGE_CLASS[c.value]
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                    <span className="truncate">{c.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={save} loading={saving} disabled={!form.name.trim() || !form.date}>
              Opslaan
            </Button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="Geplande taak verwijderen"
      >
        {deleteConfirm && (
          <div className="space-y-5">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">{deleteConfirm.name}</span> (
              {formatLongDate((deleteConfirm.first_due_at ?? '').slice(0, 10))}) wordt verwijderd.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Annuleren
              </Button>
              <Button variant="danger" onClick={remove}>
                Verwijderen
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>

      <button
        type="button"
        onClick={openNew}
        className="fixed z-30 right-4 lg:right-8 bottom-[calc(5rem+env(safe-area-inset-bottom,0px)+var(--keyboard-inset,0px))] lg:bottom-8 flex items-center justify-center w-14 h-14 rounded-full bg-mint-500 text-mint-950 shadow-lg shadow-mint-900/30 hover:bg-mint-600 active:scale-95 transition-all touch-manipulation"
        aria-label="Taak inplannen"
        title="Taak inplannen"
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>
    </div>
  )
}

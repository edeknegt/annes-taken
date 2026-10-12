'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, X, CalendarArrowUp } from 'lucide-react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { TASK_CATEGORIES, CATEGORY_BADGE_CLASS, CATEGORY_ICON, taskCategoryLabel } from '@/lib/tasks'
import type { Task, TaskCategory, TaskRule } from '@/lib/types'

// De Backlog is alles wat nog niet op de Taken-pagina hoeft te staan:
//
//  • Ongepland — taken met list 'later'. Hier kun je ze niet afvinken; je haalt
//    ze met één tik naar Binnenkort en vinkt ze daar af. Taken die een
//    terugkerende regel automatisch aanmaakt, komen hier ook binnen.
//  • Gepland — task_rules met rule_type 'once'. Op de ingestelde datum maakt de
//    Taken-pagina er vanzelf een taak van in Vandaag, en de dag ervoor staat
//    hij alvast in Binnenkort. Dit is de enige plek waar zulke eenmalige taken
//    worden gemaakt; Beheer gaat alleen over regels die zich blijven herhalen.

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

function emptyPlannedForm(): PlannedForm {
  return { id: null, name: '', date: todayIso(), category: DEFAULT_CATEGORY }
}

// Categoriekiezer — zelfde raster als bij het wijzigen van een categorie op de
// Taken-pagina, hier gedeeld door beide footers.
function CategoryPicker({
  value,
  onChange,
}: {
  value: TaskCategory
  onChange: (category: TaskCategory) => void
}) {
  return (
    <div>
      <span className="block text-sm font-medium text-gray-700 mb-1">Categorie</span>
      <div className="grid grid-cols-2 gap-1.5">
        {TASK_CATEGORIES.map(c => {
          const Icon = CATEGORY_ICON[c.value]
          const selected = value === c.value
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(c.value)}
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
  )
}

// Rond plus-knopje dat half over de onderrand van een kaart hangt — hetzelfde
// gebaar als op de Taken-pagina.
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute -bottom-5 right-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-mint-500 text-mint-950 shadow-md shadow-mint-900/25 hover:bg-mint-600 active:scale-95 transition-all touch-manipulation"
      aria-label={label}
      title={label}
    >
      <Plus className="h-5 w-5" strokeWidth={2.5} />
    </button>
  )
}

export default function BacklogPage() {
  const supabase = createClient()
  const [tasks, setTasks] = useState<Task[]>([])
  const [rules, setRules] = useState<TaskRule[]>([])
  const [loading, setLoading] = useState(true)

  // Ongeplande taak toevoegen
  const [taskSheetOpen, setTaskSheetOpen] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const [newTaskCategory, setNewTaskCategory] = useState<TaskCategory>(DEFAULT_CATEGORY)
  const [addingTask, setAddingTask] = useState(false)

  // Geplande taak toevoegen of wijzigen
  const [plannedSheetOpen, setPlannedSheetOpen] = useState(false)
  const [plannedForm, setPlannedForm] = useState<PlannedForm>(emptyPlannedForm)
  const [savingPlanned, setSavingPlanned] = useState(false)
  const [deleteRuleConfirm, setDeleteRuleConfirm] = useState<TaskRule | null>(null)

  const fetchData = useCallback(async () => {
    const [tasksRes, rulesRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .eq('list', 'later')
        .is('checked_at', null)
        .order('manual_sort_order'),
      // Alleen nog niet ingelost: zodra een geplande taak in de lijst staat,
      // zet de Taken-pagina de regel op inactief en verdwijnt hij hier.
      supabase
        .from('task_rules')
        .select('*')
        .eq('rule_type', 'once')
        .eq('active', true)
        .order('first_due_at'),
    ])
    setTasks((tasksRes.data as Task[]) ?? [])
    setRules((rulesRes.data as TaskRule[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---------------------------------------------------------------------------
  // Ongeplande taken
  // ---------------------------------------------------------------------------
  const openTaskSheet = () => {
    setNewTaskName('')
    setNewTaskCategory(DEFAULT_CATEGORY)
    setTaskSheetOpen(true)
  }

  const addTask = async () => {
    const name = newTaskName.trim()
    if (!name) return
    setAddingTask(true)

    const maxSort = tasks.length > 0 ? Math.max(...tasks.map(t => t.manual_sort_order)) : -1
    const { data: inserted } = await supabase
      .from('tasks')
      .insert({ category: newTaskCategory, name, manual_sort_order: maxSort + 1, list: 'later' })
      .select('*')
      .single()

    if (inserted) setTasks(prev => [...prev, inserted as Task])
    setAddingTask(false)
    setTaskSheetOpen(false)
  }

  // Naar Binnenkort: de taak verhuist naar de Taken-pagina en verdwijnt hier.
  const moveToQuick = async (task: Task) => {
    setTasks(prev => prev.filter(t => t.id !== task.id))

    const { data: quickTasks } = await supabase
      .from('tasks')
      .select('manual_sort_order')
      .eq('list', 'quick')
    const maxSort = quickTasks && quickTasks.length > 0
      ? Math.max(...quickTasks.map(t => t.manual_sort_order as number))
      : -1

    await supabase
      .from('tasks')
      .update({ list: 'quick', manual_sort_order: maxSort + 1 })
      .eq('id', task.id)
  }

  const deleteTask = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    await supabase.from('tasks').delete().eq('id', taskId)
  }

  // ---------------------------------------------------------------------------
  // Geplande taken
  // ---------------------------------------------------------------------------
  const openNewPlanned = () => {
    setPlannedForm(emptyPlannedForm())
    setPlannedSheetOpen(true)
  }

  const openEditPlanned = (rule: TaskRule) => {
    setPlannedForm({
      id: rule.id,
      name: rule.name,
      date: (rule.first_due_at ?? todayIso()).slice(0, 10),
      category: rule.category,
    })
    setPlannedSheetOpen(true)
  }

  const savePlanned = async () => {
    const name = plannedForm.name.trim()
    if (!name || !plannedForm.date) return
    setSavingPlanned(true)

    const payload = {
      category: plannedForm.category,
      name,
      description: null,
      rule_type: 'once' as const,
      interval_n: 1,
      recur_unit: null,
      first_due_at: plannedForm.date,
      day_of_month: null,
      weekday: null,
      month: null,
      birth_year: null,
      shift_type: null,
      gift: true,
      card: true,
      active: true,
    }

    if (plannedForm.id) {
      await supabase.from('task_rules').update(payload).eq('id', plannedForm.id)
    } else {
      await supabase.from('task_rules').insert(payload)
    }

    setSavingPlanned(false)
    setPlannedSheetOpen(false)
    fetchData()
  }

  const removePlanned = async () => {
    if (!deleteRuleConfirm) return
    await supabase.from('task_rules').delete().eq('id', deleteRuleConfirm.id)
    setRules(prev => prev.filter(r => r.id !== deleteRuleConfirm.id))
    setDeleteRuleConfirm(null)
  }

  const today = todayIso()

  return (
    <div className="max-w-2xl mx-auto">
      {/* Fixed header — zelfde patroon als Taken en Beheer. */}
      <div className="fixed top-0 left-0 right-0 lg:left-64 z-20 bg-mint-100 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="page-title truncate">Backlog</h1>
        </div>
      </div>

      {/* Spacer onder fixed header */}
      <div className="h-20 sm:h-24 lg:h-28" aria-hidden />

      {loading ? (
        <p className="text-sm text-gray-400">Laden&hellip;</p>
      ) : (
        <section className="pb-24 space-y-10">
          <div>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Ongepland
            </h2>
            <div className="relative">
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {tasks.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">
                    Niets op de plank.
                  </p>
                ) : (
                  tasks.map((task, i) => {
                    const Icon = CATEGORY_ICON[task.category]
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          'flex items-center gap-2 pl-3 pr-1',
                          i > 0 && 'border-t border-gray-100'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => moveToQuick(task)}
                          className="flex items-center justify-center p-2.5 -ml-1 rounded-full text-gray-400 hover:text-mint-700 hover:bg-mint-50 shrink-0 touch-manipulation"
                          aria-label={`${task.name} naar Binnenkort`}
                          title="Naar Binnenkort"
                        >
                          <CalendarArrowUp className="h-[18px] w-[18px]" strokeWidth={2.25} />
                        </button>

                        <span className="flex-1 min-w-0 py-2.5 truncate text-[15px] text-gray-900">
                          {task.name}
                        </span>

                        <span
                          className={cn(
                            'flex items-center justify-center h-6 w-6 rounded-full shrink-0',
                            CATEGORY_BADGE_CLASS[task.category]
                          )}
                          title={taskCategoryLabel(task.category)}
                        >
                          <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </span>

                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          className="flex items-center justify-center p-3 text-gray-300 hover:text-red-500 shrink-0"
                          aria-label="Verwijderen"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
              <AddButton label="Nieuwe taak in de backlog" onClick={openTaskSheet} />
            </div>
          </div>

          <div>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Gepland
            </h2>
            <div className="relative">
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {rules.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">
                    Nog niets op een datum gezet.
                  </p>
                ) : (
                  rules.map((rule, i) => {
                    const Icon = CATEGORY_ICON[rule.category]
                    const date = (rule.first_due_at ?? '').slice(0, 10)
                    const overdue = date < today
                    return (
                      <div
                        key={rule.id}
                        className={cn(
                          'flex items-center gap-2 pl-3 pr-1',
                          i > 0 && 'border-t border-gray-100'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => openEditPlanned(rule)}
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
                          onClick={() => setDeleteRuleConfirm(rule)}
                          className="flex items-center justify-center p-3 text-gray-300 hover:text-red-500 shrink-0"
                          aria-label="Verwijderen"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
              <AddButton label="Taak inplannen" onClick={openNewPlanned} />
            </div>
          </div>
        </section>
      )}

      {/* Nieuwe ongeplande taak: naam en categorie, verder niets — een datum
          maakt er immers een geplande taak van. */}
      <BottomSheet open={taskSheetOpen} onClose={() => setTaskSheetOpen(false)} title="Nieuwe taak">
        <div className="space-y-4">
          <Input
            label="Taak"
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            placeholder="Bijv. Moestuin opruimen"
          />

          <CategoryPicker value={newTaskCategory} onChange={setNewTaskCategory} />

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="outline" onClick={() => setTaskSheetOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={addTask} loading={addingTask} disabled={!newTaskName.trim()}>
              Opslaan
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Geplande taak: naam, dag en categorie — meer is er niet nodig. */}
      <BottomSheet
        open={plannedSheetOpen}
        onClose={() => setPlannedSheetOpen(false)}
        title={plannedForm.id ? 'Geplande taak' : 'Taak inplannen'}
      >
        <div className="space-y-4">
          <Input
            label="Taak"
            value={plannedForm.name}
            onChange={(e) => setPlannedForm(prev => ({ ...prev, name: e.target.value }))}
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
                value={plannedForm.date}
                onChange={(e) => setPlannedForm(prev => ({ ...prev, date: e.target.value }))}
                className="block w-full min-w-0 px-3 py-2 text-sm bg-transparent outline-none"
              />
            </div>
          </div>

          <CategoryPicker
            value={plannedForm.category}
            onChange={(category) => setPlannedForm(prev => ({ ...prev, category }))}
          />

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="outline" onClick={() => setPlannedSheetOpen(false)}>
              Annuleren
            </Button>
            <Button
              onClick={savePlanned}
              loading={savingPlanned}
              disabled={!plannedForm.name.trim() || !plannedForm.date}
            >
              Opslaan
            </Button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={deleteRuleConfirm !== null}
        onClose={() => setDeleteRuleConfirm(null)}
        title="Geplande taak verwijderen"
      >
        {deleteRuleConfirm && (
          <div className="space-y-5">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">{deleteRuleConfirm.name}</span> (
              {formatLongDate((deleteRuleConfirm.first_due_at ?? '').slice(0, 10))}) wordt verwijderd.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteRuleConfirm(null)}>
                Annuleren
              </Button>
              <Button variant="danger" onClick={removePlanned}>
                Verwijderen
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

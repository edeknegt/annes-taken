'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import { Plus, Check, X, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { isRuleDue, nextDueAt, formatDayMonth } from '@/lib/recurring'
import { HARDCODED_GIFT_TASKS, isHardcodedDue } from '@/lib/gift-holidays'
import { TASK_CATEGORIES, TASK_RULE_CATEGORIES, taskCategoryLabel } from '@/lib/tasks'
import { TaskRulesPanel } from '@/components/task-rules-panel'
import { setTaskCount } from '@/lib/task-counts'
import type { Task, TaskCategory, TaskRule } from '@/lib/types'

const VALID_CATEGORIES = TASK_CATEGORIES.map(c => c.value)
const RULE_CATEGORIES = TASK_RULE_CATEGORIES.map(c => c.value)

// ─────────────────────────────────────────────────────────────────────────────
// Sortable task-rij — de hele rij is het sleepvlak (geen los handvat), net
// als de items in de boodschappenlijst van Anne's keuken.
// ─────────────────────────────────────────────────────────────────────────────
interface SortableTaskProps {
  task: Task
  onToggle: (task: Task) => void
  onDelete: (taskId: string) => void
  onRename: (taskId: string, name: string) => void
}

function SortableTask({ task, onToggle, onDelete, onRename }: SortableTaskProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto' as const,
  }

  const checked = task.checked_at !== null

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  const startEditName = () => {
    flushSync(() => {
      setNameDraft(task.name)
      setEditingName(true)
    })
    nameInputRef.current?.focus()
  }

  const commitName = () => {
    setEditingName(false)
    const next = nameDraft.trim()
    if (next && next !== task.name) onRename(task.id, next)
  }

  const cancelEditName = () => {
    setEditingName(false)
    setNameDraft('')
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'relative bg-white border-t border-gray-100 first:border-t-0',
        isDragging && 'shadow-lg ring-1 ring-mint-300'
      )}
    >
      <div className="flex items-center gap-2 pl-1 pr-1 bg-white cursor-grab active:cursor-grabbing">
        <button
          type="button"
          onClick={() => onToggle(task)}
          className="flex items-center justify-center p-3 shrink-0"
          aria-label={checked ? 'Deselecteer' : 'Afvinken'}
        >
          <div
            className={cn(
              'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
              checked ? 'bg-mint-500 border-mint-500' : 'border-gray-300'
            )}
          >
            {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
          </div>
        </button>

        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                e.preventDefault()
                commitName()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                cancelEditName()
              }
            }}
            onBlur={commitName}
            className="flex-1 min-w-0 text-[15px] py-2.5 bg-transparent outline-none text-gray-900"
          />
        ) : (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); startEditName() }}
            className={cn(
              'flex-1 min-w-0 text-left text-[15px] truncate py-2.5 cursor-text',
              checked ? 'text-gray-400 line-through' : 'text-gray-900'
            )}
          >
            {task.name}
          </button>
        )}

        <button
          type="button"
          onClick={() => onDelete(task.id)}
          className="flex items-center justify-center p-3 text-gray-300 hover:text-red-500 shrink-0"
          aria-label="Verwijderen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export function CategoryPageClient() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams<{ category: string }>()
  const category = params.category as TaskCategory

  const [tasks, setTasks] = useState<Task[]>([])
  const [rules, setRules] = useState<TaskRule[]>([])
  const [loading, setLoading] = useState(true)
  const hasRules = RULE_CATEGORIES.includes(category)
  const isWerk = category === 'werk'
  const [view, setView] = useState<'taken' | 'taakregels' | 'werkdagen'>('taken')
  const VIEW_TABS = isWerk
    ? ([
        { key: 'taken', label: 'Taken' },
        { key: 'taakregels', label: 'Taakregels' },
        { key: 'werkdagen', label: 'Werkdagen' },
      ] as const)
    : ([
        { key: 'taken', label: 'Taken' },
        { key: 'taakregels', label: 'Taakregels' },
      ] as const)

  // Terug naar "Taken" bij het wisselen van categorie — anders blijft de
  // "Taakregels"-subtab van de vorige categorie hangen.
  useEffect(() => {
    setView('taken')
  }, [category])

  // Inline "Nieuwe taak…"-regel, net als de quick-add bij boodschappen —
  // geen bottom-sheet, gewoon een actieve invoerrij onderaan de lijst.
  const [addActive, setAddActive] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const [adding, setAdding] = useState(false)
  const newTaskInputRef = useRef<HTMLInputElement>(null)
  // Sync flag: onBlur en het toevoegen zelf kunnen elkaar anders in de weg
  // zitten omdat setAdding async is en de onBlur-closure dan een stale
  // waarde ziet tijdens een Enter→insert-rondje.
  const addingRef = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (!VALID_CATEGORIES.includes(category)) {
      router.replace('/huishouden')
    }
  }, [category, router])

  // ---------------------------------------------------------------------------
  // Data laden + due taakregels van deze categorie automatisch materialiseren
  // ---------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    const [tasksRes, rulesRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('category', category).order('manual_sort_order'),
      // Alle regels (ook inactieve) nodig: workday-regels worden na
      // materialiseren gedeactiveerd, maar blijven als historie tellen voor
      // de 'after_workday'-ankerdatum hieronder.
      supabase.from('task_rules').select('*').eq('category', category),
    ])

    let categoryTasks = (tasksRes.data as Task[]) || []
    const allRules = (rulesRes.data as TaskRule[]) || []
    const activeRules = allRules.filter(r => r.active)
    const now = new Date()

    // Meest recente gelogde werkdag (Dienst/Spreekuur) tot en met vandaag —
    // het ankerpunt voor 'after_workday'-regels. We houden de hele regel
    // (niet alleen de datum) vast, want het shift_type (dienst/spreekuur)
    // wordt straks in de taaknaam gezet.
    const pastWorkdayRules = allRules.filter(
      r => r.rule_type === 'workday' && r.first_due_at && new Date(r.first_due_at).getTime() <= now.getTime()
    )
    const latestWorkdayRule = pastWorkdayRules.length > 0
      ? pastWorkdayRules.reduce((latest, r) =>
          new Date(r.first_due_at as string).getTime() > new Date(latest.first_due_at as string).getTime() ? r : latest
        )
      : null
    const latestWorkdayDate = latestWorkdayRule ? new Date(latestWorkdayRule.first_due_at as string) : null

    const insertTask = async (name: string, taskRuleId: string | null) => {
      const maxSort = categoryTasks.length > 0
        ? Math.max(...categoryTasks.map(t => t.manual_sort_order))
        : -1
      const { data: inserted } = await supabase
        .from('tasks')
        .insert({ category, name, manual_sort_order: maxSort + 1, task_rule_id: taskRuleId })
        .select('*')
        .single()
      if (inserted) categoryTasks = [...categoryTasks, inserted as Task]
    }

    for (const rule of activeRules) {
      if (!isRuleDue(rule, now, latestWorkdayDate)) continue
      const hasOpenTask = categoryTasks.some(t => t.task_rule_id === rule.id && t.checked_at === null)
      if (hasOpenTask) continue

      if (rule.rule_type === 'yearly') {
        if (rule.gift) await insertTask(`Cadeau ${rule.name}`, rule.id)
        if (rule.card) await insertTask(`Kaart ${rule.name}`, rule.id)
      } else if (rule.rule_type === 'after_workday' && latestWorkdayDate && latestWorkdayRule) {
        const dateLabel = formatDayMonth(latestWorkdayDate.getDate(), latestWorkdayDate.getMonth() + 1)
        await insertTask(`${rule.name} ${latestWorkdayRule.shift_type} ${dateLabel}`, rule.id)
      } else if (rule.rule_type === 'workday') {
        // Puur logging/ankerpunt t.b.v. 'after_workday' — geen eigen,
        // op zichzelf staande taak in de lijst.
      } else {
        await insertTask(rule.name, rule.id)
      }

      if (rule.rule_type === 'workday') {
        // Eenmalig: na materialiseren deactiveren zodat 'ie niet blijft
        // herhalen. De regel (met zijn datum) blijft wel bestaan als
        // historie voor 'after_workday'.
        await supabase.from('task_rules').update({ active: false }).eq('id', rule.id)
      } else if (rule.rule_type === 'after_workday' && latestWorkdayDate) {
        // Ankerdatum vastleggen (de werkdag waarvoor dit is gematerialiseerd),
        // niet "nu" — zo blijft dit pas weer due na een NIEUWE werkdag.
        await supabase
          .from('task_rules')
          .update({ last_triggered_at: latestWorkdayDate.toISOString() })
          .eq('id', rule.id)
      } else if (
        rule.rule_type === 'fixed' &&
        ((rule.recur_unit === 'week' && rule.weekday != null) ||
          (rule.recur_unit === 'month' && rule.day_of_month != null))
      ) {
        // Patroon op specifieke weekdag/dag-van-de-maand: de due-datum
        // vastleggen (niet "nu") — anders schuift het patroon weg van de
        // gekozen dag zodra de app niet exact op de due-datum wordt geopend.
        const due = nextDueAt(rule, now, latestWorkdayDate)
        await supabase
          .from('task_rules')
          .update({ last_triggered_at: (due ?? now).toISOString() })
          .eq('id', rule.id)
      } else {
        await supabase
          .from('task_rules')
          .update({ last_triggered_at: now.toISOString() })
          .eq('id', rule.id)
      }
    }

    // Vaste, hardcoded cadeau-herinneringen (Vaderdag/Moederdag) — alleen
    // relevant onder de categorie Cadeaus, niet gekoppeld aan een task_rule.
    if (category === 'cadeaus') {
      const { data: triggerRows } = await supabase
        .from('gift_holiday_triggers')
        .select('*')
        .in('holiday_key', HARDCODED_GIFT_TASKS.map(t => t.key))

      const lastTriggeredByKey = new Map<string, string | null>(
        (triggerRows ?? []).map(r => [r.holiday_key as string, r.last_triggered_at as string | null])
      )

      for (const holiday of HARDCODED_GIFT_TASKS) {
        const lastTriggeredAt = lastTriggeredByKey.get(holiday.key) ?? null
        if (!isHardcodedDue(holiday.computeDate, lastTriggeredAt, now)) continue

        const alreadyOpen = categoryTasks.some(
          t => t.task_rule_id === null && t.checked_at === null &&
            (t.name === `Cadeau ${holiday.name}` || t.name === `Kaart ${holiday.name}`)
        )
        if (alreadyOpen) continue

        await insertTask(`Cadeau ${holiday.name}`, null)
        await insertTask(`Kaart ${holiday.name}`, null)
        await supabase
          .from('gift_holiday_triggers')
          .upsert({ holiday_key: holiday.key, last_triggered_at: now.toISOString() })
      }
    }

    setTasks(categoryTasks)
    setRules(activeRules)
    setLoading(false)
  }, [supabase, category])

  useEffect(() => {
    if (VALID_CATEGORIES.includes(category)) fetchData()
  }, [fetchData, category])

  // Rapporteer het actuele aantal openstaande taken aan de nav-bar-badge —
  // elke keer dat de lijst hier verandert (laden, afvinken, toevoegen).
  useEffect(() => {
    if (!VALID_CATEGORIES.includes(category)) return
    setTaskCount(category, tasks.filter(t => t.checked_at === null).length)
  }, [category, tasks])

  const checkedCount = tasks.filter(t => t.checked_at !== null).length

  // ---------------------------------------------------------------------------
  // Acties
  // ---------------------------------------------------------------------------
  const toggleChecked = async (task: Task) => {
    const nextCheckedAt = task.checked_at === null ? new Date().toISOString() : null
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, checked_at: nextCheckedAt } : t)))
    await supabase.from('tasks').update({ checked_at: nextCheckedAt }).eq('id', task.id)

    // Bij "na afvinken"-regels begint de volgende termijn pas te lopen zodra
    // de taak daadwerkelijk wordt afgevinkt (niet bij het aanmaken).
    if (nextCheckedAt && task.task_rule_id) {
      const rule = rules.find(r => r.id === task.task_rule_id)
      if (rule && rule.rule_type === 'after_completion') {
        setRules(prev => prev.map(r => (r.id === rule.id ? { ...r, last_triggered_at: nextCheckedAt } : r)))
        await supabase.from('task_rules').update({ last_triggered_at: nextCheckedAt }).eq('id', rule.id)
      }
    }
  }

  const deleteTask = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    await supabase.from('tasks').delete().eq('id', taskId)
  }

  const renameTask = async (taskId: string, name: string) => {
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, name } : t)))
    await supabase.from('tasks').update({ name }).eq('id', taskId)
  }

  const cleanupChecked = async () => {
    const toDelete = tasks.filter(t => t.checked_at !== null).map(t => t.id)
    if (toDelete.length === 0) return
    setTasks(prev => prev.filter(t => !toDelete.includes(t.id)))
    await supabase.from('tasks').delete().in('id', toDelete)
  }

  const activateAdd = () => {
    // flushSync + synchrone focus() (i.p.v. requestAnimationFrame) houdt de
    // focus-aanroep in dezelfde synchrone user-gesture-keten als de tik op de
    // FAB — anders opent op mobiel (vooral iOS) het invoerveld wel, maar
    // verschijnt het toetsenbord niet automatisch.
    flushSync(() => {
      setNewTaskName('')
      setAddActive(true)
    })
    newTaskInputRef.current?.focus()
  }

  const deactivateAdd = () => {
    setAddActive(false)
    setNewTaskName('')
  }

  const addTask = async () => {
    const name = newTaskName.trim()
    if (!name) return
    addingRef.current = true
    setAdding(true)

    const maxSort = tasks.length > 0
      ? Math.max(...tasks.map(t => t.manual_sort_order))
      : -1

    const { data: inserted } = await supabase
      .from('tasks')
      .insert({ category, name, manual_sort_order: maxSort + 1 })
      .select('*')
      .single()

    if (inserted) setTasks(prev => [...prev, inserted as Task])

    setNewTaskName('')
    setAdding(false)
    // Regel blijft open staan voor een volgende taak — zelfde gedrag als de
    // quick-add bij boodschappen.
    requestAnimationFrame(() => {
      newTaskInputRef.current?.focus()
      addingRef.current = false
    })
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = tasks.findIndex(t => t.id === active.id)
    const newIndex = tasks.findIndex(t => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(tasks, oldIndex, newIndex)
    const withOrder = reordered.map((t, i) => ({ ...t, manual_sort_order: i }))
    setTasks(withOrder)

    await Promise.all(
      withOrder.map((t, i) =>
        supabase.from('tasks').update({ manual_sort_order: i }).eq('id', t.id)
      )
    )
  }

  if (!VALID_CATEGORIES.includes(category) || loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-mint-100">
        <div className="loading-avatar w-20 h-20 rounded-2xl border-2 border-mint-300 shadow-sm">
          <img src="/logo.png" alt="" className="w-full h-full object-cover rounded-2xl" />
        </div>
        <p className="mt-4 text-sm text-gray-400 font-medium">Laden...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Fixed header */}
      <div className="fixed top-0 left-0 right-0 lg:left-64 z-20 bg-mint-100 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <h1 className="page-title truncate">{taskCategoryLabel(category)}</h1>
          {/* Altijd gerenderd (i.p.v. conditioneel) zodat de header-rij een
              constante hoogte houdt — anders verschuift de tab-rij hieronder
              een paar px bij het wisselen tussen Taken/Taakregels/Werkdagen. */}
          <button
            type="button"
            onClick={cleanupChecked}
            disabled={view !== 'taken' || checkedCount === 0}
            className={cn(
              'flex items-center justify-center w-9 h-9 rounded-full bg-white/70 hover:bg-white text-gray-500 hover:text-red-500 disabled:opacity-40 disabled:pointer-events-none border border-gray-200 shrink-0',
              view !== 'taken' && 'invisible'
            )}
            title="Afgevinkte taken opschonen"
            aria-label="Afgevinkte taken opschonen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {hasRules && (
          <div className="max-w-2xl mx-auto mt-3 flex gap-1 bg-white/70 border border-gray-200 rounded-full p-1 w-fit">
            {VIEW_TABS.map(v => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                  view === v.key ? 'bg-mint-500 text-mint-950' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Spacer onder fixed header */}
      <div className={cn(hasRules ? 'h-32 sm:h-36 lg:h-40' : 'h-20 sm:h-24 lg:h-28')} aria-hidden />

      {view === 'taakregels' && hasRules ? (
        <div className="pb-24">
          <TaskRulesPanel category={category} section="rules" onRulesChanged={fetchData} />
        </div>
      ) : view === 'werkdagen' && isWerk ? (
        <div className="pb-24">
          <TaskRulesPanel category={category} section="workdays" onRulesChanged={fetchData} />
        </div>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <section className="mt-2 pb-24">
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {tasks.length === 0 && !addActive && (
                  <p className="px-4 py-10 text-center text-sm text-gray-400">
                    Geen taken in {taskCategoryLabel(category).toLowerCase()}.
                  </p>
                )}
                {tasks.length > 0 && (
                  <SortableContext
                    items={tasks.map(t => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {tasks.map(task => (
                      <SortableTask
                        key={task.id}
                        task={task}
                        onToggle={toggleChecked}
                        onDelete={deleteTask}
                        onRename={renameTask}
                      />
                    ))}
                  </SortableContext>
                )}
                {addActive && (
                  <div className={cn('flex items-center gap-2 pl-1 pr-1', tasks.length > 0 && 'border-t border-gray-100')}>
                    <span className="flex items-center justify-center p-3 shrink-0" aria-hidden>
                      <span className="w-5 h-5 rounded border-2 border-gray-300" />
                    </span>
                    <input
                      ref={newTaskInputRef}
                      value={newTaskName}
                      onChange={(e) => setNewTaskName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newTaskName.trim() && !adding) {
                          e.preventDefault()
                          addTask()
                        } else if (e.key === 'Escape') {
                          deactivateAdd()
                        }
                      }}
                      onBlur={() => {
                        if (!addingRef.current) deactivateAdd()
                      }}
                      placeholder="Nieuwe taak…"
                      className="flex-1 py-2.5 bg-transparent text-[15px] placeholder:text-gray-400 outline-none min-w-0"
                    />
                    {adding ? (
                      <span
                        className="h-4 w-4 border-2 border-mint-500 border-r-transparent rounded-full animate-spin shrink-0 mr-2"
                        aria-hidden
                      />
                    ) : (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={deactivateAdd}
                        className="flex items-center justify-center p-3 shrink-0 text-gray-400 hover:text-gray-600"
                        aria-label="Sluiten"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          </DndContext>

          {/* FAB — activeert de inline "Nieuwe taak…"-regel. Blijft altijd
              zichtbaar (verdwijnt niet als de regel al actief is, verschuift
              mee boven een open keyboard). */}
          <button
            type="button"
            onClick={() => (addActive ? newTaskInputRef.current?.focus() : activateAdd())}
            className="fixed z-30 right-4 lg:right-8 bottom-[calc(5rem+env(safe-area-inset-bottom,0px)+var(--keyboard-inset,0px))] lg:bottom-8 flex items-center justify-center w-14 h-14 rounded-full bg-mint-500 text-mint-950 shadow-lg shadow-mint-900/30 hover:bg-mint-600 active:scale-95 transition-all touch-manipulation"
            aria-label="Nieuwe taak"
            title="Nieuwe taak"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </>
      )}
    </div>
  )
}

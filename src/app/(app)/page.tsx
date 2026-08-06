'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Plus, Check, X, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { isRuleDue, nextDueAt, formatDayMonth, formatDayMonthYear } from '@/lib/recurring'
import { HARDCODED_GIFT_TASKS, isHardcodedDue } from '@/lib/gift-holidays'
import { TASK_CATEGORIES, CATEGORY_BADGE_CLASS, taskCategoryLabel } from '@/lib/tasks'
import { setTodayCount } from '@/lib/task-counts'
import type { Task, TaskCategory, TaskRule } from '@/lib/types'

// Nieuwe taken die je hier zelf toevoegt krijgen een stille default-categorie
// als er geen filter actief is — categorie is nu puur een badge/filter, geen
// verplichte keuze meer.
const DEFAULT_CATEGORY: TaskCategory = 'overig'

// ─────────────────────────────────────────────────────────────────────────────
// Sortable task-rij — de hele rij is het sleepvlak (geen los handvat).
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
            className="flex-1 min-w-0 text-left py-2 cursor-text"
          >
            <span
              className={cn(
                'block truncate text-[15px]',
                checked ? 'text-gray-400 line-through' : 'text-gray-900'
              )}
            >
              {task.name}
            </span>
            {task.description && (
              <span className="block truncate text-[11px] text-gray-400">{task.description}</span>
            )}
          </button>
        )}

        <span
          className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap',
            CATEGORY_BADGE_CLASS[task.category],
            checked && 'opacity-50'
          )}
        >
          {taskCategoryLabel(task.category)}
        </span>

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
// Droppable sectie-wrapper — laat een taak ook op een lege sectie, of
// voorbij de laatste rij, gedropt worden (net als bij de boodschappenlijst
// van Anne's keuken).
// ─────────────────────────────────────────────────────────────────────────────
function SectionDropZone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn('rounded-2xl transition-colors', isOver && 'bg-mint-50/70')}>
      {children}
    </div>
  )
}

const SECTION_TODAY = 'section-today'
const SECTION_LATER = 'section-later'

// ─────────────────────────────────────────────────────────────────────────────
// Main page — Vandaag/Later over alle categorieën heen.
// ─────────────────────────────────────────────────────────────────────────────
export default function VandaagPage() {
  const supabase = createClient()

  const [tasks, setTasks] = useState<Task[]>([])
  const [rules, setRules] = useState<TaskRule[]>([])
  const [loading, setLoading] = useState(true)
  // Multi-select filterchips: staan default allemaal uit, en dan toon je
  // alles. Aanzetten van één of meer chips beperkt de weergave tot die
  // categorieën.
  const [selectedCategories, setSelectedCategories] = useState<TaskCategory[]>([])
  const toggleCategoryFilter = (category: TaskCategory) => {
    setSelectedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    )
  }

  const [addActive, setAddActive] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const [adding, setAdding] = useState(false)
  const newTaskInputRef = useRef<HTMLInputElement>(null)
  const addingRef = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ---------------------------------------------------------------------------
  // Data laden + due taakregels van alle categorieën automatisch materialiseren
  // ---------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    const [tasksRes, rulesRes] = await Promise.all([
      supabase.from('tasks').select('*').order('manual_sort_order'),
      // Alle regels (ook inactieve) nodig: workday-regels worden na
      // materialiseren gedeactiveerd, maar blijven als historie tellen voor
      // de 'after_workday'-ankerdatum hieronder.
      supabase.from('task_rules').select('*'),
    ])

    let allTasks = (tasksRes.data as Task[]) || []
    const allRules = (rulesRes.data as TaskRule[]) || []
    const now = new Date()
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

    // Afgevinkte taken 24 uur na afvinken automatisch opruimen — de
    // handmatige "opschonen"-knop blijft daarnaast beschikbaar voor eerder.
    const DAY_MS = 24 * 60 * 60 * 1000
    const staleCheckedIds = allTasks
      .filter(t => t.checked_at && now.getTime() - new Date(t.checked_at).getTime() > DAY_MS)
      .map(t => t.id)
    if (staleCheckedIds.length > 0) {
      await supabase.from('tasks').delete().in('id', staleCheckedIds)
      allTasks = allTasks.filter(t => !staleCheckedIds.includes(t.id))
    }

    // 'once' (Berichten) heeft een eigen, meerfasig traject (lead-time in
    // Later, dan verplaatsen naar Vandaag op de dag zelf) en wordt hieronder
    // apart afgehandeld — niet via de generieke "één keer materialiseren"-lus.
    const activeRules = allRules.filter(r => r.active && r.rule_type !== 'once')

    // Meest recente gelogde werkdag (Dienst/Spreekuur) tot en met vandaag —
    // het ankerpunt voor 'after_workday'-regels.
    const pastWorkdayRules = allRules.filter(
      r => r.rule_type === 'workday' && r.first_due_at && new Date(r.first_due_at).getTime() <= now.getTime()
    )
    const latestWorkdayRule = pastWorkdayRules.length > 0
      ? pastWorkdayRules.reduce((latest, r) =>
          new Date(r.first_due_at as string).getTime() > new Date(latest.first_due_at as string).getTime() ? r : latest
        )
      : null
    const latestWorkdayDate = latestWorkdayRule ? new Date(latestWorkdayRule.first_due_at as string) : null

    const insertTask = async (
      category: TaskCategory,
      name: string,
      taskRuleId: string | null,
      options?: { description?: string | null; today?: boolean }
    ) => {
      const today = options?.today ?? false
      const bucket = allTasks.filter(t => t.today === today)
      const maxSort = bucket.length > 0 ? Math.max(...bucket.map(t => t.manual_sort_order)) : -1
      const { data: inserted } = await supabase
        .from('tasks')
        .insert({
          category,
          name,
          description: options?.description ?? null,
          manual_sort_order: maxSort + 1,
          task_rule_id: taskRuleId,
          today,
        })
        .select('*')
        .single()
      if (inserted) allTasks = [...allTasks, inserted as Task]
    }

    for (const rule of activeRules) {
      if (!isRuleDue(rule, now, latestWorkdayDate)) continue
      const hasOpenTask = allTasks.some(t => t.task_rule_id === rule.id && t.checked_at === null)
      if (hasOpenTask) continue

      if (rule.rule_type === 'yearly') {
        if (rule.gift) await insertTask(rule.category, `Cadeau ${rule.name}`, rule.id)
        if (rule.card) await insertTask(rule.category, `Kaart ${rule.name}`, rule.id)
      } else if (rule.rule_type === 'after_workday' && latestWorkdayDate && latestWorkdayRule) {
        const dateLabel = formatDayMonth(latestWorkdayDate.getDate(), latestWorkdayDate.getMonth() + 1)
        await insertTask(rule.category, `${rule.name} ${latestWorkdayRule.shift_type} ${dateLabel}`, rule.id)
      } else if (rule.rule_type === 'workday') {
        // Puur logging/ankerpunt t.b.v. 'after_workday' — geen eigen,
        // op zichzelf staande taak in de lijst.
      } else {
        await insertTask(rule.category, rule.name, rule.id)
      }

      if (rule.rule_type === 'workday') {
        // Eenmalig: na materialiseren deactiveren zodat 'ie niet blijft
        // herhalen. De regel blijft wel bestaan als geschiedenis.
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

    // 'once' (Berichten): 2 dagen van tevoren al zichtbaar in Later, op de
    // datum zelf automatisch verplaatst naar Vandaag. Taaknaam bevat naam,
    // beschrijving en datum in één leesbare zin.
    const ONCE_LEAD_DAYS = 2
    const onceRules = allRules.filter(r => r.active && r.rule_type === 'once' && r.first_due_at)
    for (const rule of onceRules) {
      const dueDate = startOfDay(new Date(rule.first_due_at as string))
      const leadDate = new Date(dueDate)
      leadDate.setDate(leadDate.getDate() - ONCE_LEAD_DAYS)
      if (startOfDay(now).getTime() < leadDate.getTime()) continue

      const isDueToday = startOfDay(now).getTime() >= dueDate.getTime()
      const existingTask = allTasks.find(t => t.task_rule_id === rule.id && t.checked_at === null)

      if (!existingTask) {
        const dateLabel = formatDayMonthYear(dueDate.getDate(), dueDate.getMonth() + 1, dueDate.getFullYear())
        const taskName = rule.description
          ? `Bericht ${rule.name}: ${rule.description} (${dateLabel})`
          : `Bericht ${rule.name} (${dateLabel})`
        await insertTask(rule.category, taskName, rule.id, { today: isDueToday })
        if (isDueToday) {
          await supabase.from('task_rules').update({ active: false }).eq('id', rule.id)
        }
      } else if (isDueToday && !existingTask.today) {
        // Al aangemaakt tijdens de lead-time — nu de dag zelf: verplaats
        // 'm naar Vandaag.
        const todayBucket = allTasks.filter(t => t.today)
        const maxSort = todayBucket.length > 0 ? Math.max(...todayBucket.map(t => t.manual_sort_order)) : -1
        await supabase
          .from('tasks')
          .update({ today: true, manual_sort_order: maxSort + 1 })
          .eq('id', existingTask.id)
        allTasks = allTasks.map(t =>
          t.id === existingTask.id ? { ...t, today: true, manual_sort_order: maxSort + 1 } : t
        )
        await supabase.from('task_rules').update({ active: false }).eq('id', rule.id)
      }
    }

    // Vaste, hardcoded cadeau-herinneringen (Vaderdag/Moederdag) — niet
    // gekoppeld aan een task_rule, altijd categorie 'cadeaus'.
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

      const alreadyOpen = allTasks.some(
        t => t.task_rule_id === null && t.checked_at === null &&
          (t.name === `Cadeau ${holiday.name}` || t.name === `Kaart ${holiday.name}`)
      )
      if (alreadyOpen) continue

      await insertTask('cadeaus', `Cadeau ${holiday.name}`, null)
      await insertTask('cadeaus', `Kaart ${holiday.name}`, null)
      await supabase
        .from('gift_holiday_triggers')
        .upsert({ holiday_key: holiday.key, last_triggered_at: now.toISOString() })
    }

    setTasks(allTasks)
    setRules(activeRules)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Rapporteer het actuele aantal openstaande Vandaag-taken aan de
  // nav-bar-badge, over alle categorieën heen (niet beperkt tot de filter).
  useEffect(() => {
    setTodayCount(tasks.filter(t => t.today && t.checked_at === null).length)
  }, [tasks])

  const visibleTasks = selectedCategories.length === 0
    ? tasks
    : tasks.filter(t => selectedCategories.includes(t.category))
  const todayTasks = visibleTasks.filter(t => t.today).sort((a, b) => a.manual_sort_order - b.manual_sort_order)
  const laterTasks = visibleTasks.filter(t => !t.today).sort((a, b) => a.manual_sort_order - b.manual_sort_order)
  const checkedCount = visibleTasks.filter(t => t.checked_at !== null).length

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
    const toDelete = visibleTasks.filter(t => t.checked_at !== null).map(t => t.id)
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

    // Nieuwe taken komen hier altijd meteen in Vandaag terecht. Bij precies
    // één actieve filterchip pakken we die als categorie, anders (geen of
    // meerdere chips actief) de stille default.
    const category = selectedCategories.length === 1 ? selectedCategories[0] : DEFAULT_CATEGORY
    const todaySorted = tasks.filter(t => t.today)
    const maxSort = todaySorted.length > 0 ? Math.max(...todaySorted.map(t => t.manual_sort_order)) : -1

    const { data: inserted } = await supabase
      .from('tasks')
      .insert({ category, name, manual_sort_order: maxSort + 1, today: true })
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

  // Slepen tussen (en binnen) Vandaag/Later. Werkt op de huidige, eventueel
  // gefilterde weergave — bij een actieve categoriefilter wordt de volgorde
  // dus alleen binnen die filter opnieuw genummerd.
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const activeTask = tasks.find(t => t.id === active.id)
    if (!activeTask) return

    const overIsSection = over.id === SECTION_TODAY || over.id === SECTION_LATER
    const overTask = overIsSection ? null : tasks.find(t => t.id === over.id)
    const destToday = overIsSection ? over.id === SECTION_TODAY : (overTask ? overTask.today : activeTask.today)
    const sameSection = destToday === activeTask.today

    if (active.id === over.id && sameSection) return

    const sourceList = (activeTask.today ? todayTasks : laterTasks).filter(t => t.id !== active.id)
    const destList = sameSection ? sourceList : (destToday ? todayTasks : laterTasks).filter(t => t.id !== active.id)

    let insertIndex = destList.length
    if (overTask) {
      const idx = destList.findIndex(t => t.id === overTask.id)
      if (idx !== -1) insertIndex = idx
    }

    const movedTask = { ...activeTask, today: destToday }
    const newDest = [...destList.slice(0, insertIndex), movedTask, ...destList.slice(insertIndex)]
      .map((t, i) => ({ ...t, manual_sort_order: i }))
    const newSource = sameSection ? [] : sourceList.map((t, i) => ({ ...t, manual_sort_order: i }))

    const updated = [...newDest, ...newSource]
    const updatedById = new Map(updated.map(t => [t.id, t]))
    setTasks(prev => prev.map(t => updatedById.get(t.id) ?? t))

    await Promise.all(
      updated.map(t => supabase.from('tasks').update({ today: t.today, manual_sort_order: t.manual_sort_order }).eq('id', t.id))
    )
  }

  if (loading) {
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
          <h1 className="page-title truncate">Vandaag</h1>
          <button
            type="button"
            onClick={cleanupChecked}
            disabled={checkedCount === 0}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white/70 hover:bg-white text-gray-500 hover:text-red-500 disabled:opacity-40 disabled:pointer-events-none border border-gray-200 shrink-0"
            title="Afgevinkte taken opschonen"
            aria-label="Afgevinkte taken opschonen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="max-w-2xl mx-auto mt-3 flex gap-1.5 overflow-x-auto pb-1 -mb-1">
          {TASK_CATEGORIES.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => toggleCategoryFilter(c.value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0',
                selectedCategories.includes(c.value)
                  ? 'bg-mint-500 text-mint-950'
                  : 'bg-white/70 border border-gray-200 text-gray-600 hover:bg-white'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Spacer onder fixed header */}
      <div className="h-32 sm:h-36 lg:h-40" aria-hidden />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <section className="mt-2 pb-24 space-y-6">
          <div>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Vandaag
            </h2>
            <SectionDropZone id={SECTION_TODAY}>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {todayTasks.length === 0 && !addActive && (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">
                    Nog niets voor vandaag — sleep iets van Later, of voeg direct een taak toe.
                  </p>
                )}
                {todayTasks.length > 0 && (
                  <SortableContext items={todayTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {todayTasks.map(task => (
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
                  <div className={cn('flex items-center gap-2 pl-1 pr-1', todayTasks.length > 0 && 'border-t border-gray-100')}>
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
            </SectionDropZone>
          </div>

          <div>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Later
            </h2>
            <SectionDropZone id={SECTION_LATER}>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {laterTasks.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">
                    Niets in Later.
                  </p>
                ) : (
                  <SortableContext items={laterTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {laterTasks.map(task => (
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
              </div>
            </SectionDropZone>
          </div>
        </section>
      </DndContext>

      {/* FAB — activeert de inline "Nieuwe taak…"-regel in Vandaag. Blijft
          altijd zichtbaar, verschuift mee boven een open keyboard. */}
      <button
        type="button"
        onClick={() => (addActive ? newTaskInputRef.current?.focus() : activateAdd())}
        className="fixed z-30 right-4 lg:right-8 bottom-[calc(5rem+env(safe-area-inset-bottom,0px)+var(--keyboard-inset,0px))] lg:bottom-8 flex items-center justify-center w-14 h-14 rounded-full bg-mint-500 text-mint-950 shadow-lg shadow-mint-900/30 hover:bg-mint-600 active:scale-95 transition-all touch-manipulation"
        aria-label="Nieuwe taak"
        title="Nieuwe taak"
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>
    </div>
  )
}

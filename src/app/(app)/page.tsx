'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Plus, Check, X, Trash2, ArrowDownAZ, ListPlus } from 'lucide-react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
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
import { isRuleDue, nextDueAt, formatDayMonth } from '@/lib/recurring'
import { HARDCODED_GIFT_TASKS, isHardcodedDue } from '@/lib/gift-holidays'
import { TASK_CATEGORIES, CATEGORY_BADGE_CLASS, CATEGORY_ICON, taskCategoryLabel } from '@/lib/tasks'
import { setTodayCount } from '@/lib/task-counts'
import type { Task, TaskCategory, TaskList, TaskRule } from '@/lib/types'

// Nieuwe taken die je hier zelf toevoegt krijgen een stille default-categorie
// als er geen filter actief is — categorie is nu puur een badge/filter, geen
// verplichte keuze meer.
const DEFAULT_CATEGORY: TaskCategory = 'huishouden'

// Volgorde van de categorieën voor de "sorteer op categorie"-knop.
const CATEGORY_ORDER: Record<TaskCategory, number> = Object.fromEntries(
  TASK_CATEGORIES.map((c, i) => [c.value, i])
) as Record<TaskCategory, number>

// Standaardtaken: veelvoorkomende, niet-terugkerende taken die je met één tik
// aan Vandaag toevoegt, samen in één footer (bottom sheet) en gegroepeerd per
// klus. Een knop die meerdere taken tegelijk toevoegt (zoals de was) laat ze
// op een onderregel zien, zodat je weet wat je erbij haalt.
// Bewust zónder eigen iconen: een icoon staat in deze app voor een categorie,
// en een tweede betekenis erbij maakt het alleen maar verwarrend.
interface StandardTaskPreset {
  title: string
  category: TaskCategory
  tasks: string[]
}
interface StandardTaskGroup {
  title: string
  presets: StandardTaskPreset[]
}
const STANDARD_GROUPS: StandardTaskGroup[] = [
  {
    title: 'Was doen',
    presets: [
      {
        title: 'Gekleurde was',
        category: 'huishouden',
        tasks: [
          'Gekleurde was in de wasmachine',
          'Gekleurde was ophangen',
          'Gekleurde was afhalen',
          'Gekleurde was opvouwen',
        ],
      },
      {
        title: 'Witte was',
        category: 'huishouden',
        tasks: ['Witte was in de wasmachine', 'Witte was ophangen', 'Witte was afhalen', 'Witte was opvouwen'],
      },
    ],
  },
  {
    title: 'Benedenverdieping schoonmaken',
    presets: [
      { title: 'Benedenverdieping stoffen', category: 'huishouden', tasks: ['Benedenverdieping stoffen'] },
      { title: 'Benedenverdieping zuigen', category: 'huishouden', tasks: ['Benedenverdieping zuigen'] },
      { title: 'Benedenverdieping dweilen', category: 'huishouden', tasks: ['Benedenverdieping dweilen'] },
    ],
  },
  {
    title: 'Bovenverdieping schoonmaken',
    presets: [
      { title: 'Bovenverdieping stoffen', category: 'huishouden', tasks: ['Bovenverdieping stoffen'] },
      { title: 'Bovenverdieping zuigen', category: 'huishouden', tasks: ['Bovenverdieping zuigen'] },
    ],
  },
  {
    title: "WC's schoonmaken",
    presets: [
      { title: 'WC beneden schoonmaken', category: 'huishouden', tasks: ['WC beneden schoonmaken'] },
      { title: 'WC boven schoonmaken', category: 'huishouden', tasks: ['WC boven schoonmaken'] },
    ],
  },
  {
    title: 'Overig',
    presets: [
      { title: 'Boodschappen doen', category: 'huishouden', tasks: ['Boodschappen doen'] },
      { title: 'Keuken schoonmaken', category: 'huishouden', tasks: ['Keuken schoonmaken'] },
      { title: 'Badkamer schoonmaken', category: 'huishouden', tasks: ['Badkamer schoonmaken'] },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Sortable task-rij — de hele rij is het sleepvlak (geen los handvat).
// ─────────────────────────────────────────────────────────────────────────────
interface SortableTaskProps {
  task: Task
  onToggle: (task: Task) => void
  onDelete: (taskId: string) => void
  onRename: (taskId: string, name: string) => void
  onChangeCategory: (task: Task) => void
}

function SortableTask({ task, onToggle, onDelete, onRename, onChangeCategory }: SortableTaskProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto' as const,
  }

  const checked = task.checked_at !== null
  const CategoryIcon = CATEGORY_ICON[task.category]

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

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onChangeCategory(task) }}
          className={cn(
            'flex items-center justify-center h-6 w-6 rounded-full shrink-0',
            CATEGORY_BADGE_CLASS[task.category],
            checked && 'opacity-50'
          )}
          aria-label={`Categorie: ${taskCategoryLabel(task.category)} — wijzigen`}
          title={`${taskCategoryLabel(task.category)} — categorie wijzigen`}
        >
          <CategoryIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>

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
const SECTION_QUICK = 'section-quick'
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

  // Nieuwe taak: footer (bottom sheet) met Beschrijving, Categorie en Lijst
  // (Vandaag/Later) — i.p.v. een inline invoerregel, omdat er nu meer dan
  // alleen de naam is in te vullen.
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  // Footer met standaardtaken (losse taken en sets) om snel toe te voegen.
  const [standardSheetOpen, setStandardSheetOpen] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const [newTaskCategory, setNewTaskCategory] = useState<TaskCategory>(DEFAULT_CATEGORY)
  const [newTaskList, setNewTaskList] = useState<TaskList>('today')
  const [adding, setAdding] = useState(false)
  const newTaskNameRef = useRef<HTMLInputElement>(null)

  // Categorie van een taak wijzigen: tik op het badge, kies een categorie
  // in de footer die daarvoor opent.
  const [categoryPickerTask, setCategoryPickerTask] = useState<Task | null>(null)

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
      options?: { description?: string | null; list?: TaskList }
    ) => {
      const list = options?.list ?? 'later'
      const bucket = allTasks.filter(t => t.list === list)
      const maxSort = bucket.length > 0 ? Math.max(...bucket.map(t => t.manual_sort_order)) : -1
      const { data: inserted } = await supabase
        .from('tasks')
        .insert({
          category,
          name,
          description: options?.description ?? null,
          manual_sort_order: maxSort + 1,
          task_rule_id: taskRuleId,
          list,
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

    // 'once' — de geplande taken (Gepland-tab): eenmalig op een vaste datum.
    // De dag ervoor staan ze alvast in Snel, op de dag zelf in Vandaag, met
    // precies de naam die je hebt ingevoerd.
    const GEPLAND_LEAD_DAYS = 1
    const onceRules = allRules.filter(r => r.active && r.rule_type === 'once' && r.first_due_at)
    for (const rule of onceRules) {
      const dueDate = startOfDay(new Date(rule.first_due_at as string))
      const leadDate = new Date(dueDate)
      leadDate.setDate(leadDate.getDate() - GEPLAND_LEAD_DAYS)
      if (startOfDay(now).getTime() < leadDate.getTime()) continue

      const isDueToday = startOfDay(now).getTime() >= dueDate.getTime()
      const existingTask = allTasks.find(t => t.task_rule_id === rule.id && t.checked_at === null)

      if (!existingTask) {
        await insertTask(rule.category, rule.name, rule.id, { list: isDueToday ? 'today' : 'quick' })
        if (isDueToday) {
          await supabase.from('task_rules').update({ active: false }).eq('id', rule.id)
        }
      } else if (isDueToday && existingTask.list !== 'today') {
        // Al aangemaakt tijdens de lead-time — nu de dag zelf: verplaats
        // 'm naar Vandaag.
        const todayBucket = allTasks.filter(t => t.list === 'today')
        const maxSort = todayBucket.length > 0 ? Math.max(...todayBucket.map(t => t.manual_sort_order)) : -1
        await supabase
          .from('tasks')
          .update({ list: 'today', manual_sort_order: maxSort + 1 })
          .eq('id', existingTask.id)
        allTasks = allTasks.map(t =>
          t.id === existingTask.id ? { ...t, list: 'today', manual_sort_order: maxSort + 1 } : t
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
    setTodayCount(tasks.filter(t => t.list === 'today' && t.checked_at === null).length)
  }, [tasks])

  const visibleTasks = selectedCategories.length === 0
    ? tasks
    : tasks.filter(t => selectedCategories.includes(t.category))
  const byList = (list: TaskList) =>
    visibleTasks.filter(t => t.list === list).sort((a, b) => a.manual_sort_order - b.manual_sort_order)
  const todayTasks = byList('today')
  const quickTasks = byList('quick')
  const laterTasks = byList('later')
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

  const changeCategory = async (category: TaskCategory) => {
    if (!categoryPickerTask) return
    const taskId = categoryPickerTask.id
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, category } : t)))
    setCategoryPickerTask(null)
    await supabase.from('tasks').update({ category }).eq('id', taskId)
  }

  const cleanupChecked = async () => {
    const toDelete = visibleTasks.filter(t => t.checked_at !== null).map(t => t.id)
    if (toDelete.length === 0) return
    setTasks(prev => prev.filter(t => !toDelete.includes(t.id)))
    await supabase.from('tasks').delete().in('id', toDelete)
  }

  const openAddSheet = () => {
    // Bij precies één actieve filterchip pakken we die als default-
    // categorie, anders (geen of meerdere chips actief) de stille default.
    setNewTaskName('')
    setNewTaskCategory(selectedCategories.length === 1 ? selectedCategories[0] : DEFAULT_CATEGORY)
    setNewTaskList('today')
    setAddSheetOpen(true)
    setTimeout(() => newTaskNameRef.current?.focus(), 50)
  }

  const addTask = async () => {
    const name = newTaskName.trim()
    if (!name) return
    setAdding(true)

    const bucket = tasks.filter(t => t.list === newTaskList)
    const maxSort = bucket.length > 0 ? Math.max(...bucket.map(t => t.manual_sort_order)) : -1

    const { data: inserted } = await supabase
      .from('tasks')
      .insert({ category: newTaskCategory, name, manual_sort_order: maxSort + 1, list: newTaskList })
      .select('*')
      .single()

    if (inserted) setTasks(prev => [...prev, inserted as Task])

    setAdding(false)
    setAddSheetOpen(false)
  }

  // Standaardtaak: voegt in één keer alle taken uit een preset toe aan Vandaag,
  // alsof ze los, handmatig zijn toegevoegd.
  const addStandardPreset = async (preset: StandardTaskPreset) => {
    setStandardSheetOpen(false)
    const bucket = tasks.filter(t => t.list === 'today')
    let nextSort = bucket.length > 0 ? Math.max(...bucket.map(t => t.manual_sort_order)) + 1 : 0
    const rows = preset.tasks.map(name => ({
      category: preset.category,
      name,
      manual_sort_order: nextSort++,
      list: 'today' as const,
    }))

    const { data: inserted } = await supabase.from('tasks').insert(rows).select('*')
    if (inserted) setTasks(prev => [...prev, ...(inserted as Task[])])
  }

  // Slepen tussen (en binnen) Vandaag/Snel/Later. Werkt op de huidige,
  // eventueel gefilterde weergave — bij een actieve categoriefilter wordt
  // de volgorde dus alleen binnen die filter opnieuw genummerd.
  const tasksByList = (list: TaskList) =>
    list === 'today' ? todayTasks : list === 'quick' ? quickTasks : laterTasks

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const activeTask = tasks.find(t => t.id === active.id)
    if (!activeTask) return

    const overIsSection = over.id === SECTION_TODAY || over.id === SECTION_QUICK || over.id === SECTION_LATER
    const overTask = overIsSection ? null : tasks.find(t => t.id === over.id)
    const destList: TaskList = overIsSection
      ? (over.id === SECTION_TODAY ? 'today' : over.id === SECTION_QUICK ? 'quick' : 'later')
      : (overTask ? overTask.list : activeTask.list)
    const sameSection = destList === activeTask.list

    if (active.id === over.id && sameSection) return

    const sourceArr = tasksByList(activeTask.list).filter(t => t.id !== active.id)
    const destArr = sameSection ? sourceArr : tasksByList(destList).filter(t => t.id !== active.id)

    let insertIndex = destArr.length
    if (overTask) {
      const idx = destArr.findIndex(t => t.id === overTask.id)
      if (idx !== -1) insertIndex = idx
    }

    const movedTask = { ...activeTask, list: destList }
    const newDest = [...destArr.slice(0, insertIndex), movedTask, ...destArr.slice(insertIndex)]
      .map((t, i) => ({ ...t, manual_sort_order: i }))
    const newSource = sameSection ? [] : sourceArr.map((t, i) => ({ ...t, manual_sort_order: i }))

    const updated = [...newDest, ...newSource]
    const updatedById = new Map(updated.map(t => [t.id, t]))
    setTasks(prev => prev.map(t => updatedById.get(t.id) ?? t))

    await Promise.all(
      updated.map(t => supabase.from('tasks').update({ list: t.list, manual_sort_order: t.manual_sort_order }).eq('id', t.id))
    )
  }

  // Zet Vandaag en Later (elk apart) op volgorde van categorie, en binnen
  // een categorie op naam (A-Z) — net als de "Loopvolgorde"-knop bij de
  // boodschappenlijst van Anne's keuken.
  const sortByCategory = async () => {
    // Alleen op categorie sorteren — binnen een categorie blijft de
    // bestaande onderlinge volgorde staan. `todayTasks`/`laterTasks` staan
    // al in de huidige weergavevolgorde, en Array#sort is stable, dus een
    // sort die alleen op categorie vergelijkt behoudt die volgorde binnen
    // gelijke categorieën vanzelf.
    const sortSection = (list: Task[]) =>
      [...list]
        .sort((a, b) => (CATEGORY_ORDER[a.category] ?? 999) - (CATEGORY_ORDER[b.category] ?? 999))
        .map((t, i) => ({ ...t, manual_sort_order: i }))

    const updated = [...sortSection(todayTasks), ...sortSection(quickTasks), ...sortSection(laterTasks)]
    const updatedById = new Map(updated.map(t => [t.id, t]))
    setTasks(prev => prev.map(t => updatedById.get(t.id) ?? t))

    await Promise.all(
      updated.map(t => supabase.from('tasks').update({ manual_sort_order: t.manual_sort_order }).eq('id', t.id))
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
          <h1 className="page-title truncate">Taken</h1>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={sortByCategory}
              disabled={visibleTasks.length === 0}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-white/70 hover:bg-white text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:pointer-events-none border border-gray-200 shrink-0"
              title="Sorteer op categorie"
              aria-label="Sorteer op categorie"
            >
              <ArrowDownAZ className="h-4 w-4" />
            </button>
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
        </div>

        {/* De acht filters verdelen samen precies de breedte van de takenlijst
            eronder (flex-1 per knop). py-1 / -my-1 houdt ruimte voor de ring om
            een actief filter. */}
        <div className="max-w-2xl mx-auto mt-3 flex gap-1.5 py-1 -my-1">
          {/* Filter op categorie: hetzelfde icoon in hetzelfde kleurtje als op
              de taken zelf. Een actief filter is voluit gekleurd met een
              mint-ring eromheen, een inactief filter staat gedempt — zo blijft
              zichtbaar welke kleur bij welke categorie hoort. */}
          {TASK_CATEGORIES.map(c => {
            const Icon = CATEGORY_ICON[c.value]
            const selected = selectedCategories.includes(c.value)
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => toggleCategoryFilter(c.value)}
                aria-pressed={selected}
                aria-label={c.label}
                title={c.label}
                className={cn(
                  'flex flex-1 items-center justify-center h-9 rounded-xl transition-all',
                  CATEGORY_BADGE_CLASS[c.value],
                  selected ? 'ring-2 ring-mint-600' : 'opacity-40 hover:opacity-70'
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2.5} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Spacer onder fixed header */}
      <div className="h-32 sm:h-36 lg:h-40" aria-hidden />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <section className="mt-4 pb-24 space-y-6">
          <div>
            {/* De standaardtaken-knop staat bewust naast deze kop: wat je daar
                kiest, komt in Vandaag terecht. Onderlangs uitgelijnd, zodat het
                woord Vandaag even ver boven zijn lijst staat als Snel en Later
                — de knop is hoger dan de kop en zou de regel anders oprekken.
                De knop zelf houdt met mb-1 wat extra lucht onder zich. */}
            <div className="mb-2 px-1 flex items-end justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Vandaag
              </h2>
              <button
                type="button"
                onClick={() => setStandardSheetOpen(true)}
                className="mb-1 flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 bg-white/70 text-gray-500 text-xs font-medium hover:bg-white hover:text-gray-700 active:scale-95 transition-all touch-manipulation"
              >
                <ListPlus className="h-3.5 w-3.5" strokeWidth={2.5} />
                Standaardtaak
              </button>
            </div>
            <SectionDropZone id={SECTION_TODAY}>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {todayTasks.length === 0 && (
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
                        onChangeCategory={setCategoryPickerTask}
                      />
                    ))}
                  </SortableContext>
                )}
              </div>
            </SectionDropZone>
          </div>

          <div>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Snel
            </h2>
            <SectionDropZone id={SECTION_QUICK}>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {quickTasks.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">
                    Niets in Snel.
                  </p>
                ) : (
                  <SortableContext items={quickTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {quickTasks.map(task => (
                      <SortableTask
                        key={task.id}
                        task={task}
                        onToggle={toggleChecked}
                        onDelete={deleteTask}
                        onRename={renameTask}
                        onChangeCategory={setCategoryPickerTask}
                      />
                    ))}
                  </SortableContext>
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
                        onChangeCategory={setCategoryPickerTask}
                      />
                    ))}
                  </SortableContext>
                )}
              </div>
            </SectionDropZone>
          </div>
        </section>
      </DndContext>

      {/* FAB — opent de footer om een nieuwe taak toe te voegen. Blijft
          altijd zichtbaar, verschuift mee boven een open keyboard. */}
      <button
        type="button"
        onClick={openAddSheet}
        className="fixed z-30 right-4 lg:right-8 bottom-[calc(5rem+env(safe-area-inset-bottom,0px)+var(--keyboard-inset,0px))] lg:bottom-8 flex items-center justify-center w-14 h-14 rounded-full bg-mint-500 text-mint-950 shadow-lg shadow-mint-900/30 hover:bg-mint-600 active:scale-95 transition-all touch-manipulation"
        aria-label="Nieuwe taak"
        title="Nieuwe taak"
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      {/* Footer om een nieuwe taak toe te voegen: Beschrijving, Categorie
          en Lijst (Vandaag/Later). */}
      <BottomSheet open={addSheetOpen} onClose={() => setAddSheetOpen(false)} title="Nieuwe taak">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Beschrijving
            </label>
            <input
              ref={newTaskNameRef}
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTaskName.trim() && !adding) {
                  e.preventDefault()
                  addTask()
                }
              }}
              placeholder="bijv. planten water geven"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500 placeholder:text-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categorie
            </label>
            <select
              value={newTaskCategory}
              onChange={(e) => setNewTaskCategory(e.target.value as TaskCategory)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500"
            >
              {TASK_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lijst
            </label>
            <select
              value={newTaskList}
              onChange={(e) => setNewTaskList(e.target.value as TaskList)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500"
            >
              <option value="today">Vandaag</option>
              <option value="quick">Snel</option>
              <option value="later">Later</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setAddSheetOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={addTask} loading={adding} disabled={!newTaskName.trim()}>
              Opslaan
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Footer met standaardtaken: eerst de losse taken, daaronder de sets
          die in één tik meerdere taken toevoegen. Alles komt in Vandaag. */}
      <BottomSheet
        open={standardSheetOpen}
        onClose={() => setStandardSheetOpen(false)}
        title="Standaardtaak toevoegen"
      >
        <div className="space-y-4">
          {STANDARD_GROUPS.map(group => (
            <div key={group.title}>
              <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.presets.map(preset => (
                  <button
                    key={preset.title}
                    type="button"
                    onClick={() => addStandardPreset(preset)}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 rounded-lg bg-gray-100 text-left hover:bg-gray-200 transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-700">
                        {preset.title}
                        {preset.tasks.length > 1 && (
                          <span className="ml-1.5 text-xs font-normal text-gray-400">
                            {preset.tasks.length} taken
                          </span>
                        )}
                      </span>
                      {preset.tasks.length > 1 && (
                        <span className="block truncate text-[11px] text-gray-400">
                          {preset.tasks.join(' · ')}
                        </span>
                      )}
                    </span>
                    <Plus className="h-4 w-4 text-gray-400 shrink-0" strokeWidth={2.5} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </BottomSheet>

      {/* Footer om de categorie van een bestaande taak te wijzigen — tik op
          het categorie-badge op een taak om 'm hier te openen. */}
      <BottomSheet
        open={categoryPickerTask !== null}
        onClose={() => setCategoryPickerTask(null)}
        title="Categorie wijzigen"
      >
        <div className="grid grid-cols-2 gap-1.5">
          {TASK_CATEGORIES.map(c => {
            const Icon = CATEGORY_ICON[c.value]
            const selected = categoryPickerTask?.category === c.value
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => changeCategory(c.value)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                  selected
                    ? 'bg-mint-500 text-mint-950'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
      </BottomSheet>
    </div>
  )
}

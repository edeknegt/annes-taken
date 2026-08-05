'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Pencil, X, Repeat, Briefcase } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { describeRule, describeRelativeDate, SHIFT_TYPE_LABEL } from '@/lib/recurring'
import { HARDCODED_GIFT_TASKS } from '@/lib/gift-holidays'
import { taskCategoryLabel } from '@/lib/tasks'
import type { TaskCategory, TaskRule, RecurringRuleType, RecurUnit, ShiftType } from '@/lib/types'

interface RuleForm {
  id?: string
  category: TaskCategory
  name: string
  rule_type: RecurringRuleType
  interval_n: number
  recur_unit: RecurUnit
  first_due_at: string
  day_of_month: number
  month: number
  shift_type: ShiftType
  gift: boolean
  card: boolean
  active: boolean
}

const todayIso = () => new Date().toISOString().slice(0, 10)

function makeDefaultForm(category: TaskCategory): RuleForm {
  return {
    category,
    name: '',
    rule_type: 'fixed',
    interval_n: 1,
    recur_unit: 'week',
    first_due_at: todayIso(),
    day_of_month: 1,
    month: 1,
    shift_type: 'dienst',
    gift: true,
    card: true,
    active: true,
  }
}

function ruleToForm(r: TaskRule): RuleForm {
  return {
    id: r.id,
    category: r.category,
    name: r.name,
    rule_type: r.rule_type,
    interval_n: r.interval_n,
    recur_unit: r.recur_unit ?? 'week',
    first_due_at: r.first_due_at ?? todayIso(),
    day_of_month: r.day_of_month ?? 1,
    month: r.month ?? 1,
    shift_type: r.shift_type ?? 'dienst',
    gift: r.gift,
    card: r.card,
    active: r.active,
  }
}

// Verjaardagen gebruiken één datum-veld; jaar is niet relevant voor de
// jaarlijkse herhaling, dus we hangen 'm op een neutraal (schrikkel-)jaar.
const BIRTHDATE_PLACEHOLDER_YEAR = 2000
const pad2 = (n: number) => String(n).padStart(2, '0')

const UNIT_LABEL: Record<RecurUnit, { singular: string; plural: string }> = {
  day: { singular: 'dag', plural: 'dagen' },
  week: { singular: 'week', plural: 'weken' },
  month: { singular: 'maand', plural: 'maanden' },
}

interface TaskRulesPanelProps {
  category: TaskCategory
  // Alleen relevant voor Werk: welke van de twee tabbladen dit is. Bepaalt
  // welk blok getoond wordt en waar de FAB naartoe opent.
  section?: 'rules' | 'workdays'
  // Na het opslaan/verwijderen/(de)activeren van een regel: laat de Taken-
  // pagina direct opnieuw checken of er (bv. door een net toegevoegde
  // verjaardag binnen de lead time) meteen een taak gematerialiseerd moet
  // worden, in plaats van pas bij een volgende paginalading.
  onRulesChanged?: () => void
}

export function TaskRulesPanel({ category, section = 'rules', onRulesChanged }: TaskRulesPanelProps) {
  const supabase = createClient()

  const [rules, setRules] = useState<TaskRule[]>([])
  const [loading, setLoading] = useState(true)

  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState<RuleForm>(makeDefaultForm(category))
  // Los van `form` bijgehouden zodat het jaartal dat je in de datumkiezer
  // instelt niet elke render teruggezet wordt naar het placeholder-jaar —
  // alleen maand + dag daaruit worden opgeslagen, het jaar is decoratief.
  const [birthDateInput, setBirthDateInput] = useState(`${BIRTHDATE_PLACEHOLDER_YEAR}-01-01`)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<TaskRule | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const fetchRules = useCallback(async () => {
    const { data } = await supabase
      .from('task_rules')
      .select('*')
      .eq('category', category)
      .order('active', { ascending: false })
      .order('created_at', { ascending: false })
    setRules((data as TaskRule[]) || [])
    setLoading(false)
  }, [supabase, category])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const isGifts = category === 'cadeaus'
  const isWerk = category === 'werk'
  const workdayRules = rules.filter(r => r.rule_type === 'workday')
  const genericRules = rules.filter(r => r.rule_type !== 'workday')

  const openNew = () => {
    setForm({
      ...makeDefaultForm(category),
      rule_type: isGifts ? 'yearly' : 'fixed',
    })
    setBirthDateInput(`${BIRTHDATE_PLACEHOLDER_YEAR}-01-01`)
    setEditorOpen(true)
    setTimeout(() => nameRef.current?.focus(), 50)
  }

  const openNewWorkday = () => {
    setForm({
      ...makeDefaultForm('werk'),
      rule_type: 'workday',
      first_due_at: todayIso(),
      shift_type: 'dienst',
    })
    setEditorOpen(true)
  }

  const openEdit = (rule: TaskRule) => {
    setForm(ruleToForm(rule))
    setBirthDateInput(`${BIRTHDATE_PLACEHOLDER_YEAR}-${pad2(rule.month ?? 1)}-${pad2(rule.day_of_month ?? 1)}`)
    setEditorOpen(true)
  }

  const save = async () => {
    const isYearly = form.rule_type === 'yearly'
    const isWorkday = form.rule_type === 'workday'
    const name = isWorkday ? SHIFT_TYPE_LABEL[form.shift_type] : form.name.trim()
    if (!name) return
    setSaving(true)

    const payload = {
      category: form.category,
      name,
      rule_type: form.rule_type,
      interval_n:
        isYearly || isWorkday || form.rule_type === 'after_workday'
          ? 1
          : Math.max(1, Number.isFinite(form.interval_n) ? form.interval_n : 1),
      recur_unit:
        isYearly || isWorkday || form.rule_type === 'after_workday' ? null : form.recur_unit,
      first_due_at:
        form.rule_type === 'after_completion' || form.rule_type === 'fixed'
          ? (form.first_due_at < todayIso() ? todayIso() : form.first_due_at)
          : isWorkday
            ? form.first_due_at
            : null,
      day_of_month: isYearly ? Math.min(31, Math.max(1, form.day_of_month)) : null,
      month: isYearly ? Math.min(12, Math.max(1, form.month)) : null,
      shift_type: isWorkday ? form.shift_type : null,
      gift: isYearly ? form.gift : true,
      card: isYearly ? form.card : true,
      active: form.active,
    }

    if (form.id) {
      await supabase.from('task_rules').update(payload).eq('id', form.id)
    } else {
      await supabase.from('task_rules').insert(payload)
    }

    setSaving(false)
    setEditorOpen(false)
    fetchRules()
    onRulesChanged?.()
  }

  const toggleActive = async (rule: TaskRule) => {
    const next = !rule.active
    setRules(prev => prev.map(r => (r.id === rule.id ? { ...r, active: next } : r)))
    await supabase.from('task_rules').update({ active: next }).eq('id', rule.id)
    onRulesChanged?.()
  }

  const deleteRule = async () => {
    if (!deleteConfirm) return
    await supabase.from('task_rules').delete().eq('id', deleteConfirm.id)
    setRules(prev => prev.filter(r => r.id !== deleteConfirm.id))
    setDeleteConfirm(null)
    onRulesChanged?.()
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Laden&hellip;</p>
  }

  return (
    <>
      {isGifts ? (
        <>
          <h2 className="mt-2 mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Verjaardagen
          </h2>
          {rules.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 px-4 py-12 text-center">
              <Repeat className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-4">Nog geen verjaardagen toegevoegd.</p>
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-1" />
                Eerste verjaardag toevoegen
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {rules.map((rule, i) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  first={i === 0}
                  onToggle={toggleActive}
                  onEdit={openEdit}
                  onDelete={setDeleteConfirm}
                />
              ))}
            </div>
          )}

          <h2 className="mt-6 mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Vaderdag en Moederdag
          </h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {HARDCODED_GIFT_TASKS.map((t, i) => (
              <div
                key={t.key}
                className={cn('flex items-center gap-2 px-3', i > 0 && 'border-t border-gray-100')}
              >
                <div className="flex-1 min-w-0 py-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[15px] text-gray-900 truncate">{t.name}</span>
                    <span className="text-[10px] font-medium text-mint-700 bg-mint-100 rounded-full px-1.5 py-0.5 shrink-0">
                      Cadeau
                    </span>
                    <span className="text-[10px] font-medium text-mint-700 bg-mint-100 rounded-full px-1.5 py-0.5 shrink-0">
                      Kaart
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{t.description}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : isWerk && section === 'workdays' ? (
        <>
          {workdayRules.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 px-4 py-12 text-center mt-2">
              <Briefcase className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-4">Nog geen werkdagen toegevoegd.</p>
              <Button onClick={openNewWorkday}>
                <Plus className="h-4 w-4 mr-1" />
                Eerste werkdag toevoegen
              </Button>
            </div>
          ) : (
            <section className="mt-2">
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {workdayRules.map((rule, i) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    first={i === 0}
                    onToggle={toggleActive}
                    onEdit={openEdit}
                    onDelete={setDeleteConfirm}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      ) : isWerk ? (
        genericRules.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-12 text-center mt-2">
            <Repeat className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4">Nog geen taakregels in werk.</p>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />
              Eerste taakregel aanmaken
            </Button>
          </div>
        ) : (
          <section className="mt-2">
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {genericRules.map((rule, i) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  first={i === 0}
                  onToggle={toggleActive}
                  onEdit={openEdit}
                  onDelete={setDeleteConfirm}
                />
              ))}
            </div>
          </section>
        )
      ) : rules.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 px-4 py-12 text-center mt-2">
          <Repeat className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-4">
            Nog geen taakregels in {taskCategoryLabel(category).toLowerCase()}.
          </p>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />
            Eerste taakregel aanmaken
          </Button>
        </div>
      ) : (
        <section className="mt-2">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {rules.map((rule, i) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                first={i === 0}
                onToggle={toggleActive}
                onEdit={openEdit}
                onDelete={setDeleteConfirm}
              />
            ))}
          </div>
        </section>
      )}

      {/* Editor modal */}
      <BottomSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={
          form.rule_type === 'workday'
            ? form.id ? 'Dienst/spreekuur bewerken' : 'Nieuwe dienst of spreekuur'
            : form.category === 'cadeaus'
              ? form.id ? 'Verjaardag bewerken' : 'Nieuwe verjaardag'
              : form.id ? 'Taakregel bewerken' : 'Nieuwe taakregel'
        }
      >
        {form.rule_type === 'workday' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Type
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['dienst', 'spreekuur'] as ShiftType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, shift_type: t }))}
                    className={cn(
                      'px-2 py-2 rounded-lg text-xs font-medium transition-colors touch-manipulation',
                      form.shift_type === t
                        ? 'bg-mint-500 text-mint-950'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    {SHIFT_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Datum
              </label>
              <input
                type="date"
                value={form.first_due_at}
                onChange={(e) => setForm(prev => ({ ...prev, first_due_at: e.target.value }))}
                className="w-full min-w-0 max-w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>
                Annuleren
              </Button>
              <Button onClick={save} loading={saving} disabled={!form.first_due_at}>
                Opslaan
              </Button>
            </div>
          </div>
        ) : form.category === 'cadeaus' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Naam
              </label>
              <input
                ref={nameRef}
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="bijv. Anna"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Geboortedatum
              </label>
              <input
                type="date"
                value={birthDateInput}
                onChange={(e) => {
                  setBirthDateInput(e.target.value)
                  const [, m, d] = e.target.value.split('-').map(Number)
                  if (!m || !d) return
                  setForm(prev => ({ ...prev, month: m, day_of_month: d }))
                }}
                className="w-full min-w-0 max-w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Herinnering
              </label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={form.gift}
                    onChange={(e) => setForm(prev => ({ ...prev, gift: e.target.checked }))}
                    className="rounded border-gray-300 text-mint-600 focus:ring-mint-200"
                  />
                  Cadeau
                </label>
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={form.card}
                    onChange={(e) => setForm(prev => ({ ...prev, card: e.target.checked }))}
                    className="rounded border-gray-300 text-mint-600 focus:ring-mint-200"
                  />
                  Kaart
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>
                Annuleren
              </Button>
              <Button onClick={save} loading={saving} disabled={!form.name.trim()}>
                Opslaan
              </Button>
            </div>
          </div>
        ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Taak
            </label>
            <input
              ref={nameRef}
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="bijv. planten water geven"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500 placeholder:text-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Herhaalpatroon
            </label>
            <div className={cn('grid gap-1.5', form.category === 'werk' ? 'grid-cols-3' : 'grid-cols-2')}>
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, rule_type: 'after_completion' }))}
                className={cn(
                  'px-2 py-2 rounded-lg text-xs font-medium transition-colors touch-manipulation text-left',
                  form.rule_type === 'after_completion'
                    ? 'bg-mint-500 text-mint-950'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                Na afvinken
              </button>
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, rule_type: 'fixed' }))}
                className={cn(
                  'px-2 py-2 rounded-lg text-xs font-medium transition-colors touch-manipulation text-left',
                  form.rule_type === 'fixed'
                    ? 'bg-mint-500 text-mint-950'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                Vaste cadans
              </button>
              {form.category === 'werk' && (
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, rule_type: 'after_workday' }))}
                  className={cn(
                    'px-2 py-2 rounded-lg text-xs font-medium transition-colors touch-manipulation text-left',
                    form.rule_type === 'after_workday'
                      ? 'bg-mint-500 text-mint-950'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  Na werkdag
                </button>
              )}
            </div>
          </div>

          {/* N + eenheid — niet van toepassing bij "Na werkdag": de taak
              wordt gewoon toegevoegd op de werkdag zelf. */}
          {form.rule_type !== 'after_workday' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700 whitespace-nowrap">Elke</span>
              <input
                type="number"
                min={1}
                value={Number.isNaN(form.interval_n) ? '' : form.interval_n}
                onChange={(e) => {
                  // Laat het veld tijdelijk leeg toe tijdens het typen (bv.
                  // 1 -> 2 door eerst te wissen), pas bij verlaten van het
                  // veld wordt dit teruggezet naar minimaal 1.
                  const raw = e.target.value
                  setForm(prev => ({ ...prev, interval_n: raw === '' ? NaN : parseInt(raw) }))
                }}
                onBlur={() =>
                  setForm(prev => ({
                    ...prev,
                    interval_n: Number.isFinite(prev.interval_n) ? Math.max(1, prev.interval_n) : 1,
                  }))
                }
                className="w-16 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500 tabular-nums"
              />
              <select
                value={form.recur_unit}
                onChange={(e) => setForm(prev => ({ ...prev, recur_unit: e.target.value as RecurUnit }))}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500"
              >
                {(['day', 'week', 'month'] as RecurUnit[]).map(u => (
                  <option key={u} value={u}>
                    {form.interval_n === 1 ? UNIT_LABEL[u].singular : UNIT_LABEL[u].plural}
                  </option>
                ))}
              </select>
              {form.rule_type === 'after_completion' && (
                <span className="text-sm text-gray-700 whitespace-nowrap">na afvinken</span>
              )}
            </div>
          )}

          {(form.rule_type === 'after_completion' || form.rule_type === 'fixed') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Eerste datum
              </label>
              <input
                type="date"
                min={todayIso()}
                value={form.first_due_at}
                onChange={(e) => setForm(prev => ({
                  ...prev,
                  first_due_at: e.target.value < todayIso() ? todayIso() : e.target.value,
                }))}
                className="w-full min-w-0 max-w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={save} loading={saving} disabled={!form.name.trim()}>
              Opslaan
            </Button>
          </div>
        </div>
        )}
      </BottomSheet>

      {/* Delete confirm */}
      <BottomSheet
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="Taakregel verwijderen"
      >
        {deleteConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">{deleteConfirm.name}</span> ({describeRule(deleteConfirm)}) wordt verwijderd.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Annuleren
              </Button>
              <Button variant="danger" onClick={deleteRule}>
                Verwijderen
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* FAB — bij Werk gescheiden per tabblad: Werkdagen-tab opent de
          dienst/spreekuur-editor, Taakregels-tab de gewone regel-editor. */}
      <button
        type="button"
        onClick={isWerk && section === 'workdays' ? openNewWorkday : openNew}
        className="fixed z-30 right-4 lg:right-8 bottom-[calc(5rem+env(safe-area-inset-bottom,0px)+var(--keyboard-inset,0px))] lg:bottom-8 flex items-center justify-center w-14 h-14 rounded-full bg-mint-500 text-mint-950 shadow-lg shadow-mint-900/30 hover:bg-mint-600 active:scale-95 transition-all touch-manipulation"
        aria-label={isWerk && section === 'workdays' ? 'Nieuwe werkdag' : 'Nieuwe taakregel'}
        title={isWerk && section === 'workdays' ? 'Nieuwe werkdag' : 'Nieuwe taakregel'}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Regel-rij
// ─────────────────────────────────────────────────────────────────────────────
interface RuleRowProps {
  rule: TaskRule
  first: boolean
  onToggle: (rule: TaskRule) => void
  onEdit: (rule: TaskRule) => void
  onDelete: (rule: TaskRule) => void
}

function RuleRow({ rule, first, onToggle, onEdit, onDelete }: RuleRowProps) {
  const isYearly = rule.rule_type === 'yearly'
  const isWorkday = rule.rule_type === 'workday'
  const hideToggleAndHistory = isYearly || isWorkday

  return (
    <div className={cn('flex items-center gap-2 px-3', !first && 'border-t border-gray-100')}>
      {!hideToggleAndHistory && (
        <button
          type="button"
          onClick={() => onToggle(rule)}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
            rule.active ? 'bg-mint-500' : 'bg-gray-300'
          )}
          title={rule.active ? 'Pauzeren' : 'Activeren'}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              rule.active ? 'translate-x-4' : 'translate-x-0.5'
            )}
          />
        </button>
      )}
      <div className="flex-1 min-w-0 py-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[15px] text-gray-900 truncate">{rule.name}</span>
          {isYearly && rule.gift && (
            <span className="text-[10px] font-medium text-mint-700 bg-mint-100 rounded-full px-1.5 py-0.5 shrink-0">
              Cadeau
            </span>
          )}
          {isYearly && rule.card && (
            <span className="text-[10px] font-medium text-mint-700 bg-mint-100 rounded-full px-1.5 py-0.5 shrink-0">
              Kaart
            </span>
          )}
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span>{describeRule(rule)}</span>
          {!hideToggleAndHistory && (
            <>
              <span className="text-gray-300">·</span>
              <span>laatst toegevoegd: {describeRelativeDate(rule.last_triggered_at)}</span>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onEdit(rule)}
        className="flex items-center justify-center p-3 text-gray-400 hover:text-gray-700"
        title="Bewerken"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(rule)}
        className="flex items-center justify-center p-3 mr-1 text-gray-400 hover:text-red-500"
        title="Verwijderen"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

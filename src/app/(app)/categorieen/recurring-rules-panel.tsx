'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Pencil, X, Search, Repeat } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DAY_OF_WEEK_OPTIONS,
  describeRule,
  describeRelativeDate,
} from '@/lib/recurring'
import type { Product, RecurringRule, RecurringRuleType } from '@/lib/types'

interface RuleForm {
  id?: string
  product_id: string | null
  name: string
  amount_text: string
  rule_type: RecurringRuleType
  interval_n: number
  day_of_week: number
  day_of_month: number
  active: boolean
}

const defaultForm: RuleForm = {
  product_id: null,
  name: '',
  amount_text: '',
  rule_type: 'weekly',
  interval_n: 1,
  day_of_week: 1,
  day_of_month: 1,
  active: true,
}

function ruleToForm(r: RecurringRule): RuleForm {
  return {
    id: r.id,
    product_id: r.product_id,
    name: r.name,
    amount_text: r.amount_text ?? '',
    rule_type: r.rule_type,
    interval_n: r.interval_n,
    day_of_week: r.day_of_week ?? 1,
    day_of_month: r.day_of_month ?? 1,
    active: r.active,
  }
}

export function RecurringRulesPanel() {
  const supabase = createClient()

  const [rules, setRules] = useState<RecurringRule[]>([])
  const [loading, setLoading] = useState(true)

  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState<RuleForm>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState<Product[]>([])
  const [deleteConfirm, setDeleteConfirm] = useState<RecurringRule | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const fetchRules = useCallback(async () => {
    const { data } = await supabase
      .from('recurring_rules')
      .select('*')
      .order('active', { ascending: false })
      .order('created_at', { ascending: false })
    setRules((data as RecurringRule[]) || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  // Typeahead voor product-keuze in de modal
  useEffect(() => {
    if (!editorOpen) return
    const q = form.name.trim().toLowerCase()
    if (q.length < 1) {
      setSuggestions([])
      return
    }
    // Niet meer zoeken als de naam exact overeenkomt met de gekozen product
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('*, shop_category:shop_categories(*)')
        .ilike('name_normalized', `%${q}%`)
        .order('name')
        .limit(10)
      setSuggestions((data as Product[]) || [])
    }, 140)
    return () => clearTimeout(handle)
  }, [form.name, editorOpen, supabase])

  const openNew = () => {
    setForm(defaultForm)
    setEditorOpen(true)
    setTimeout(() => nameRef.current?.focus(), 50)
  }

  const openEdit = (rule: RecurringRule) => {
    setForm(ruleToForm(rule))
    setEditorOpen(true)
  }

  const pickProduct = (p: Product) => {
    setForm(prev => ({ ...prev, product_id: p.id, name: p.name }))
    setSuggestions([])
  }

  const save = async () => {
    const name = form.name.trim()
    if (!name) return
    setSaving(true)

    const payload = {
      product_id: form.product_id,
      name,
      amount_text: form.amount_text.trim() || null,
      rule_type: form.rule_type,
      interval_n: Math.max(1, form.interval_n),
      day_of_week: form.rule_type === 'weekly' ? form.day_of_week : null,
      day_of_month:
        form.rule_type === 'monthly'
          ? Math.min(31, Math.max(1, form.day_of_month))
          : null,
      active: form.active,
    }

    if (form.id) {
      await supabase.from('recurring_rules').update(payload).eq('id', form.id)
    } else {
      await supabase.from('recurring_rules').insert(payload)
    }

    setSaving(false)
    setEditorOpen(false)
    fetchRules()
  }

  const toggleActive = async (rule: RecurringRule) => {
    const next = !rule.active
    setRules(prev => prev.map(r => (r.id === rule.id ? { ...r, active: next } : r)))
    await supabase.from('recurring_rules').update({ active: next }).eq('id', rule.id)
  }

  const deleteRule = async () => {
    if (!deleteConfirm) return
    await supabase.from('recurring_rules').delete().eq('id', deleteConfirm.id)
    setRules(prev => prev.filter(r => r.id !== deleteConfirm.id))
    setDeleteConfirm(null)
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Laden&hellip;</p>
  }

  return (
    <>
      {rules.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 px-4 py-12 text-center mt-2">
          <Repeat className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-4">
            Nog geen boodschappenregels. Maak er een aan voor producten die je regelmatig nodig hebt.
          </p>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />
            Eerste boodschappenregel aanmaken
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
        title={form.id ? 'Boodschappenregel bewerken' : 'Nieuwe boodschappenregel'}
      >
        <div className="space-y-4">
          <div>
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input
                    ref={nameRef}
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value, product_id: null }))}
                    placeholder="bijv. brood, wc-papier"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500 placeholder:text-gray-400"
                  />
                </div>
              </div>
              <div className="w-28 shrink-0">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Aantal
                </label>
                <input
                  value={form.amount_text}
                  onChange={(e) => setForm(prev => ({ ...prev, amount_text: e.target.value }))}
                  placeholder="1 brood"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500 placeholder:text-gray-400"
                />
              </div>
            </div>
            {suggestions.length > 0 && !suggestions.some(s => s.name === form.name) && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                {suggestions.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pickProduct(s)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-mint-50 text-left touch-manipulation"
                  >
                    <span className="flex-1 text-sm text-gray-900">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Herhaalt
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ['weekly', 'Wekelijks'],
                ['monthly', 'Maandelijks'],
                ['interval', 'Iedere N dagen'],
              ] as [RecurringRuleType, string][]).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, rule_type: type }))}
                  className={cn(
                    'px-2 py-2 rounded-lg text-xs font-medium transition-colors touch-manipulation',
                    form.rule_type === type
                      ? 'bg-mint-500 text-mint-950'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Schema details — alles inline op één regel */}
          {form.rule_type === 'weekly' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Elke</span>
              <input
                type="number"
                min={1}
                value={form.interval_n}
                onChange={(e) =>
                  setForm(prev => ({ ...prev, interval_n: Math.max(1, parseInt(e.target.value) || 1) }))
                }
                className="w-16 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500 tabular-nums"
              />
              <span className="text-sm text-gray-700 whitespace-nowrap">
                {form.interval_n === 1 ? 'week op' : 'weken op'}
              </span>
              <select
                value={form.day_of_week}
                onChange={(e) => setForm(prev => ({ ...prev, day_of_week: parseInt(e.target.value) }))}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500"
              >
                {DAY_OF_WEEK_OPTIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.long}</option>
                ))}
              </select>
            </div>
          )}

          {form.rule_type === 'monthly' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Elke</span>
              <input
                type="number"
                min={1}
                value={form.interval_n}
                onChange={(e) =>
                  setForm(prev => ({ ...prev, interval_n: Math.max(1, parseInt(e.target.value) || 1) }))
                }
                className="w-16 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500 tabular-nums"
              />
              <span className="text-sm text-gray-700 whitespace-nowrap">
                {form.interval_n === 1 ? 'maand op dag' : 'maanden op dag'}
              </span>
              <input
                type="number"
                min={1}
                max={31}
                value={form.day_of_month}
                onChange={(e) =>
                  setForm(prev => ({
                    ...prev,
                    day_of_month: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)),
                  }))
                }
                className="w-16 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500 tabular-nums"
              />
            </div>
          )}

          {form.rule_type === 'interval' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Elke</span>
              <input
                type="number"
                min={1}
                value={form.interval_n}
                onChange={(e) =>
                  setForm(prev => ({ ...prev, interval_n: Math.max(1, parseInt(e.target.value) || 1) }))
                }
                className="w-16 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-mint-200 focus:border-mint-500 tabular-nums"
              />
              <span className="text-sm text-gray-700">
                {form.interval_n === 1 ? 'dag' : 'dagen'}
              </span>
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
      </BottomSheet>

      {/* Delete confirm */}
      <BottomSheet
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="Boodschappenregel verwijderen"
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

      {/* FAB — nieuwe boodschappenregel */}
      <button
        type="button"
        onClick={openNew}
        className="fixed z-30 right-4 lg:right-8 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:bottom-8 flex items-center justify-center w-14 h-14 rounded-full bg-mint-500 text-mint-950 shadow-lg shadow-mint-900/30 hover:bg-mint-600 active:scale-95 transition-all touch-manipulation"
        aria-label="Nieuwe boodschappenregel"
        title="Nieuwe boodschappenregel"
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
  rule: RecurringRule
  first: boolean
  onToggle: (rule: RecurringRule) => void
  onEdit: (rule: RecurringRule) => void
  onDelete: (rule: RecurringRule) => void
}

function RuleRow({ rule, first, onToggle, onEdit, onDelete }: RuleRowProps) {
  return (
    <div className={cn('flex items-center gap-2 px-3', !first && 'border-t border-gray-100')}>
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
      <div className="flex-1 min-w-0 py-2.5">
        <div className="flex items-baseline gap-2">
          {rule.amount_text && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 bg-gray-100 rounded shrink-0 tabular-nums">
              {rule.amount_text}
            </span>
          )}
          <span className="text-[15px] text-gray-900 truncate">{rule.name}</span>
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span>{describeRule(rule)}</span>
          <span className="text-gray-300">·</span>
          <span>laatst toegevoegd: {describeRelativeDate(rule.last_triggered_at)}</span>
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

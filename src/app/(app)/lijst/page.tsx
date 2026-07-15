'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'
import {
  Plus,
  Check,
  X,
  Route,
  Trash2,
  Merge,
  FolderPlus,
  Repeat,
} from 'lucide-react'
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
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
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { cn } from '@/lib/utils'
import { mergeAmountTexts, shopCategoryPillClass } from '@/lib/shopping'
import { resolveProductForIngredient } from '@/lib/product-resolver'
import { describeRule, isRuleDue } from '@/lib/recurring'
import type {
  Product,
  RecurringRule,
  ShopCategory,
  ShoppingGroup,
  ShoppingItem,
} from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Sortable item row
// ─────────────────────────────────────────────────────────────────────────────
interface SortableItemProps {
  item: ShoppingItem
  supabase: ReturnType<typeof createClient>
  onToggle: (item: ShoppingItem) => void
  onDelete: (itemId: string) => void
  onAmountSave: (itemId: string, newText: string | null) => void
  onNameSave: (itemId: string, newName: string, product?: Product) => void
}

function SortableItem({
  item,
  supabase,
  onToggle,
  onDelete,
  onAmountSave,
  onNameSave,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto' as const,
  }

  const checked = item.checked_at !== null

  const [editingAmount, setEditingAmount] = useState(false)
  const [amountDraft, setAmountDraft] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameSuggestions, setNameSuggestions] = useState<Product[]>([])
  const amountInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editingName) {
      setNameSuggestions([])
      return
    }
    const q = nameDraft.trim().toLowerCase()
    if (q.length < 1) {
      setNameSuggestions([])
      return
    }
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('*, shop_category:shop_categories(*)')
        .ilike('name_normalized', `%${q}%`)
        .order('name')
        .limit(8)
      setNameSuggestions((data as Product[]) || [])
    }, 140)
    return () => clearTimeout(handle)
  }, [nameDraft, editingName, supabase])

  const startEditAmount = () => {
    flushSync(() => {
      setAmountDraft(item.amount_text ?? '')
      setEditingAmount(true)
    })
    amountInputRef.current?.focus()
  }

  const commitAmount = () => {
    setEditingAmount(false)
    const next = amountDraft.trim() || null
    if (next !== (item.amount_text ?? null)) {
      onAmountSave(item.id, next)
    }
  }

  const cancelEditAmount = () => {
    setEditingAmount(false)
    setAmountDraft('')
  }

  const startEditName = () => {
    flushSync(() => {
      setNameDraft(item.name)
      setEditingName(true)
    })
    nameInputRef.current?.focus()
  }

  const commitName = (product?: Product) => {
    setEditingName(false)
    setNameSuggestions([])
    const next = (product?.name ?? nameDraft).trim()
    if (!next) return
    if (product || next !== item.name) {
      onNameSave(item.id, next, product)
    }
  }

  const cancelEditName = () => {
    setEditingName(false)
    setNameSuggestions([])
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
        onClick={() => onToggle(item)}
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

      {/* Hoeveelheid: pill (met tap-to-edit), of ghost-plus voor leeg veld */}
      {editingAmount ? (
        <input
          ref={amountInputRef}
          autoFocus
          value={amountDraft}
          onChange={(e) => setAmountDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              commitAmount()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancelEditAmount()
            }
          }}
          onBlur={commitAmount}
          placeholder="500 g"
          className="w-14 text-[11px] font-medium px-1.5 py-1 rounded border border-mint-400 bg-white outline-none focus:ring-2 focus:ring-mint-200 tabular-nums shrink-0"
        />
      ) : item.amount_text ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); startEditAmount() }}
          className={cn(
            'text-[11px] font-medium px-1.5 py-0.5 bg-gray-100 rounded shrink-0 tabular-nums transition-colors touch-manipulation hover:bg-gray-200 cursor-text',
            checked && 'opacity-50'
          )}
          aria-label="Hoeveelheid bewerken"
        >
          {item.amount_text}
        </button>
      ) : (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); startEditAmount() }}
          className="shrink-0 -mx-1 px-2 py-2 rounded flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 touch-manipulation"
          aria-label="Hoeveelheid toevoegen"
          tabIndex={-1}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </button>
      )}

      {editingName ? (
        <div className="flex-1 min-w-0 relative">
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
            onBlur={() => commitName()}
            className="w-full text-[15px] py-2.5 bg-transparent outline-none text-gray-900"
          />
          {nameDraft.trim().length > 0 && nameSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white rounded-xl border border-gray-200 shadow-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {nameSuggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitName(s)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-mint-50 text-left touch-manipulation"
                >
                  <span className="flex-1 text-sm text-gray-900 truncate">{s.name}</span>
                  {s.shop_category && (
                    <span
                      className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap',
                        shopCategoryPillClass(s.shop_category.slug)
                      )}
                    >
                      {s.shop_category.name}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); startEditName() }}
          className={cn(
            'flex-1 min-w-0 text-left text-[15px] truncate py-2.5 cursor-text',
            checked ? 'text-gray-400 line-through' : 'text-gray-900'
          )}
        >
          {item.name}
        </button>
      )}
      {item.shop_category && (
        <span
          className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap',
            shopCategoryPillClass(item.shop_category.slug),
            checked && 'opacity-50'
          )}
        >
          {item.shop_category.name}
        </span>
      )}

      <button
        type="button"
        onClick={() => onDelete(item.id)}
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
// Drop-zone voor een groep: hele body (items + "Nieuw item…" rij) accepteert
// drops zodat een item ook in een lege groep of onderaan kan worden gezet.
// ─────────────────────────────────────────────────────────────────────────────
function GroupDropZone({
  groupId,
  children,
}: {
  groupId: string
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${groupId}` })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'transition-colors rounded-b-2xl',
        isOver && 'bg-mint-50/70'
      )}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function LijstPage() {
  const supabase = createClient()

  const [groups, setGroups] = useState<ShoppingGroup[]>([])
  const [shopCategories, setShopCategories] = useState<ShopCategory[]>([])
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [loading, setLoading] = useState(true)

  // Nieuwe-groep inline
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const newGroupInputRef = useRef<HTMLInputElement>(null)
  // Sync flag: createGroup wordt vanuit zowel Enter (onKeyDown) als blur
  // (onBlur) getriggerd. Zonder deze guard kan een dubbele call de groep
  // twee keer insertten, omdat de focus-overgang naar de quick-add net na
  // het indrukken van Enter ook een blur veroorzaakt.
  const creatingGroupRef = useRef(false)

  // Inline hernoemen
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renamingGroupName, setRenamingGroupName] = useState('')

  // Inline quick-add (Apple Reminders-stijl, per groep activeerbaar)
  const [quickName, setQuickName] = useState('')
  const [quickSuggestions, setQuickSuggestions] = useState<Product[]>([])
  const [quickAdding, setQuickAdding] = useState(false)
  const [quickTargetGroupId, setQuickTargetGroupId] = useState<string | null>(null)
  const quickInputRef = useRef<HTMLInputElement>(null)
  // Sync flag: setQuickAdding is async, dus de onBlur-closure ziet 'm pas na
  // de volgende render. Tijdens een rondje Enter→insert mag de regel niet
  // sluiten — daarom checkt onBlur dit ref-fixed flag.
  const quickAddingRef = useRef(false)

  // Confirmaties
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<{
    groupId: string
    groupName: string
  } | null>(null)

  // Samenvoegen
  const [mergeSource, setMergeSource] = useState<ShoppingGroup | null>(null)

  // Bron-groep van het item dat op dit moment gesleept wordt (voor cross-list drag)
  const dragOriginGroupRef = useRef<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ---------------------------------------------------------------------------
  // Data laden
  // ---------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    const [groupsRes, catsRes, itemsRes, rulesRes] = await Promise.all([
      supabase
        .from('shopping_groups')
        .select('*')
        .order('is_default', { ascending: false })
        .order('sort_order'),
      supabase.from('shop_categories').select('*').order('sort_order'),
      supabase
        .from('shopping_items')
        .select('*, shop_category:shop_categories(*)')
        .order('manual_sort_order'),
      supabase
        .from('recurring_rules')
        .select('*')
        .eq('active', true),
    ])

    setGroups((groupsRes.data as ShoppingGroup[]) || [])
    setShopCategories((catsRes.data as ShopCategory[]) || [])
    setItems((itemsRes.data as ShoppingItem[]) || [])
    setRules((rulesRes.data as RecurringRule[]) || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const defaultGroup = useMemo(() => groups.find(g => g.is_default) ?? null, [groups])
  const adHocGroups = useMemo(() => groups.filter(g => !g.is_default), [groups])

  const itemsByGroup = useMemo(() => {
    const m: Record<string, ShoppingItem[]> = {}
    for (const it of items) (m[it.group_id] ||= []).push(it)
    return m
  }, [items])

  // ---------------------------------------------------------------------------
  // Typeahead: quick-add balk
  // Online: live Supabase-query. Offline: filter de gecachte products-lijst
  // uit de snapshot — zelfde "contains"-gedrag als ilike op name_normalized.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const q = quickName.trim().toLowerCase()
    if (q.length < 1) {
      setQuickSuggestions([])
      return
    }

    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('*, shop_category:shop_categories(*)')
        .ilike('name_normalized', `%${q}%`)
        .order('name')
        .limit(8)
      setQuickSuggestions((data as Product[]) || [])
    }, 140)
    return () => clearTimeout(handle)
  }, [quickName, supabase])

  // ---------------------------------------------------------------------------
  // Quick-add: activeer inline invoer voor een specifieke groep
  // ---------------------------------------------------------------------------
  const activateQuickAdd = (groupId: string) => {
    flushSync(() => {
      if (quickTargetGroupId !== groupId) {
        setQuickName('')
        setQuickSuggestions([])
      }
      setQuickTargetGroupId(groupId)
    })
    quickInputRef.current?.focus()
  }

  const deactivateQuickAdd = () => {
    setQuickTargetGroupId(null)
    setQuickName('')
    setQuickSuggestions([])
  }

  const quickAdd = async (rawName: string, product?: Product) => {
    const name = rawName.trim()
    if (!name || !quickTargetGroupId) return
    quickAddingRef.current = true
    setQuickAdding(true)

    const groupId = quickTargetGroupId
    const targetItems = itemsByGroup[groupId] ?? []
    const maxSort = targetItems.length > 0
      ? Math.max(...targetItems.map(i => i.manual_sort_order))
      : -1
    const nextSort = maxSort + 1

    let productId = product?.id ?? null
    let categoryId = product?.shop_category_id ?? null

    if (!productId) {
      const resolved = await resolveProductForIngredient(supabase, name)
      if (resolved) {
        productId = resolved.productId
        categoryId = resolved.shopCategoryId
      } else {
        const overig = shopCategories.find(c => c.slug === 'overig')
        if (overig) {
          const { data: created } = await supabase
            .from('products')
            .insert({
              name,
              name_normalized: name.toLowerCase(),
              shop_category_id: overig.id,
              is_seed: false,
            })
            .select('id')
            .single()
          productId = created?.id ?? null
          categoryId = overig.id
        }
      }
    }

    const { data: inserted } = await supabase
      .from('shopping_items')
      .insert({
        group_id: groupId,
        product_id: productId,
        name,
        amount_text: null,
        shop_category_id: categoryId,
        manual_sort_order: nextSort,
      })
      .select('*, shop_category:shop_categories(*)')
      .single()

    if (inserted) setItems(prev => [...prev, inserted as ShoppingItem])

    setQuickName('')
    setQuickSuggestions([])
    setQuickAdding(false)
    // Houd de regel "open" voor een volgend item: focus terug op het
    // input-veld zodra de DOM weer rust. quickAddingRef.current zetten we
    // pas na de focus, anders kan onBlur (door een korte focus-flicker op
    // iOS) de regel toch nog sluiten.
    requestAnimationFrame(() => {
      quickInputRef.current?.focus()
      quickAddingRef.current = false
    })
  }

  // ---------------------------------------------------------------------------
  // Item-acties
  // ---------------------------------------------------------------------------
  const toggleChecked = async (item: ShoppingItem) => {
    const nextCheckedAt = item.checked_at === null ? new Date().toISOString() : null

    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, checked_at: nextCheckedAt } : i)))

    await supabase
      .from('shopping_items')
      .update({ checked_at: nextCheckedAt })
      .eq('id', item.id)
  }

  const deleteItem = async (itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId))
    await supabase.from('shopping_items').delete().eq('id', itemId)
  }

  const saveAmount = async (itemId: string, newText: string | null) => {
    setItems(prev =>
      prev.map(i => (i.id === itemId ? { ...i, amount_text: newText } : i))
    )
    await supabase.from('shopping_items').update({ amount_text: newText }).eq('id', itemId)
  }

  const saveName = async (itemId: string, newName: string, product?: Product) => {
    let productId: string | null = product?.id ?? null
    let categoryId: string | null = product?.shop_category_id ?? null
    let shopCategory: ShopCategory | null = product?.shop_category ?? null

    if (!product) {
      const resolved = await resolveProductForIngredient(supabase, newName)
      if (resolved) {
        productId = resolved.productId
        categoryId = resolved.shopCategoryId
        shopCategory = shopCategories.find(c => c.id === categoryId) ?? null
      } else {
        const overig = shopCategories.find(c => c.slug === 'overig')
        if (overig) {
          const { data: created } = await supabase
            .from('products')
            .insert({
              name: newName,
              name_normalized: newName.toLowerCase(),
              shop_category_id: overig.id,
              is_seed: false,
            })
            .select('id')
            .single()
          productId = created?.id ?? null
          categoryId = overig.id
          shopCategory = overig
        }
      }
    }

    setItems(prev =>
      prev.map(i =>
        i.id === itemId
          ? {
              ...i,
              name: newName,
              product_id: productId ?? i.product_id,
              shop_category_id: categoryId ?? i.shop_category_id,
              shop_category: shopCategory ?? i.shop_category,
            }
          : i
      )
    )

    const patch: Record<string, string | null> = { name: newName }
    if (productId !== null) patch.product_id = productId
    if (categoryId !== null) patch.shop_category_id = categoryId
    await supabase.from('shopping_items').update(patch).eq('id', itemId)
  }

  const cleanupChecked = async () => {
    const toDelete = items.filter(i => i.checked_at !== null).map(i => i.id)
    if (toDelete.length === 0) {
      setCleanupOpen(false)
      return
    }
    setItems(prev => prev.filter(i => i.checked_at === null))
    await supabase.from('shopping_items').delete().in('id', toDelete)
    setCleanupOpen(false)
  }

  // ---------------------------------------------------------------------------
  // Drag & drop: binnen-groep sorteren en tussen-groep verplaatsen
  // ---------------------------------------------------------------------------
  const findContainer = (id: string): string | null => {
    if (id.startsWith('group:')) return id.slice(6)
    const it = items.find(i => i.id === id)
    return it?.group_id ?? null
  }

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    const it = items.find(i => i.id === id)
    dragOriginGroupRef.current = it?.group_id ?? null
  }

  // Tijdens slepen: als het item boven een andere groep/item zweeft, verplaats
  // het alvast in lokale state zodat dnd-kit de drop-positie goed kan berekenen.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const activeContainer = findContainer(activeId)
    const overContainer = findContainer(overId)
    if (!activeContainer || !overContainer) return
    if (activeContainer === overContainer) return

    setItems(prev => {
      const activeItem = prev.find(i => i.id === activeId)
      if (!activeItem) return prev
      const others = prev.filter(i => i.id !== activeId)
      const moved = { ...activeItem, group_id: overContainer }

      if (overId.startsWith('group:')) {
        // Drop op de groep-container zelf (lege groep of onderaan): achteraan
        // inzetten binnen dat segment.
        const before = others.filter(i => i.group_id !== overContainer)
        const into = others.filter(i => i.group_id === overContainer)
        return [...before, ...into, moved]
      }

      const overIndex = others.findIndex(i => i.id === overId)
      if (overIndex === -1) return prev
      return [...others.slice(0, overIndex), moved, ...others.slice(overIndex)]
    })
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    const origGroup = dragOriginGroupRef.current
    dragOriginGroupRef.current = null
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)

    const activeItem = items.find(i => i.id === activeId)
    if (!activeItem) return
    const targetGroup = activeItem.group_id

    // Finaliseer de positie binnen de doelgroep (reorder tussen items).
    let finalItems = items
    if (!overId.startsWith('group:') && activeId !== overId) {
      const overItem = items.find(i => i.id === overId)
      if (overItem && overItem.group_id === targetGroup) {
        const groupItems = items.filter(i => i.group_id === targetGroup)
        const oldIndex = groupItems.findIndex(i => i.id === activeId)
        const newIndex = groupItems.findIndex(i => i.id === overId)
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(groupItems, oldIndex, newIndex)
          const others = items.filter(i => i.group_id !== targetGroup)
          finalItems = [...others, ...reordered]
        }
      }
    }

    // Bereken nieuwe manual_sort_order per getroffen groep en pas ze toe in
    // lokale state én op de server.
    const affected = new Set<string>([targetGroup])
    if (origGroup && origGroup !== targetGroup) affected.add(origGroup)

    const reindexed = finalItems.map(it => {
      if (!affected.has(it.group_id)) return it
      const groupOrdered = finalItems.filter(x => x.group_id === it.group_id)
      const idx = groupOrdered.findIndex(x => x.id === it.id)
      return idx >= 0 ? { ...it, manual_sort_order: idx } : it
    })
    setItems(reindexed)

    const updates: PromiseLike<unknown>[] = []
    for (const gid of affected) {
      const groupOrdered = reindexed.filter(i => i.group_id === gid)
      groupOrdered.forEach((it, i) => {
        const patch: { manual_sort_order: number; group_id?: string } = {
          manual_sort_order: i,
        }
        if (it.id === activeId && origGroup && origGroup !== targetGroup) {
          patch.group_id = targetGroup
        }
        updates.push(supabase.from('shopping_items').update(patch).eq('id', it.id))
      })
    }
    await Promise.all(updates)
  }

  const sortDefaultByCategory = async () => {
    if (!defaultGroup) return
    const defItems = itemsByGroup[defaultGroup.id] ?? []
    const order: Record<string, number> = {}
    shopCategories.forEach(c => { order[c.id] = c.sort_order })
    const sorted = [...defItems].sort((a, b) => {
      const ao = order[a.shop_category_id ?? ''] ?? 999
      const bo = order[b.shop_category_id ?? ''] ?? 999
      if (ao !== bo) return ao - bo
      return a.manual_sort_order - b.manual_sort_order
    })
    const withOrder = sorted.map((it, i) => ({ ...it, manual_sort_order: i }))
    const others = items.filter(it => it.group_id !== defaultGroup.id)
    setItems([...others, ...withOrder])
    await Promise.all(
      withOrder.map((it, i) =>
        supabase.from('shopping_items').update({ manual_sort_order: i }).eq('id', it.id)
      )
    )
  }

  // ---------------------------------------------------------------------------
  // Groep-acties
  // ---------------------------------------------------------------------------
  const startAddGroup = () => {
    setNewGroupName('')
    setAddingGroup(true)
    setTimeout(() => newGroupInputRef.current?.focus(), 0)
  }

  const createGroup = async () => {
    if (creatingGroupRef.current) return
    const name = newGroupName.trim()
    if (!name) {
      setAddingGroup(false)
      return
    }
    creatingGroupRef.current = true
    try {
      const maxSort = adHocGroups.length > 0
        ? Math.max(...adHocGroups.map(g => g.sort_order))
        : 0
      const { data } = await supabase
        .from('shopping_groups')
        .insert({
          name,
          is_default: false,
          sort_order: maxSort + 1,
        })
        .select('*')
        .single()
      setAddingGroup(false)
      setNewGroupName('')
      if (data) {
        const newGroup = data as ShoppingGroup
        setGroups(prev => [...prev, newGroup])
        // Activeer meteen de quick-add voor de zojuist gemaakte groep, zodat
        // je na Enter direct de eerste boodschap kunt typen.
        setQuickName('')
        setQuickSuggestions([])
        setQuickTargetGroupId(newGroup.id)
        // Dubbele rAF: eerst moet de nieuwe card mounten, dan pas bestaat
        // het input-veld van de active add-rij.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => quickInputRef.current?.focus())
        })
      }
    } finally {
      creatingGroupRef.current = false
    }
  }

  const startRenameGroup = (group: ShoppingGroup) => {
    setRenamingGroupId(group.id)
    setRenamingGroupName(group.name)
  }

  const saveRenameGroup = async (groupId: string) => {
    const name = renamingGroupName.trim()
    if (!name) {
      setRenamingGroupId(null)
      return
    }
    const existing = groups.find(g => g.id === groupId)
    if (existing && existing.name === name) {
      setRenamingGroupId(null)
      return
    }
    await supabase.from('shopping_groups').update({ name }).eq('id', groupId)
    setGroups(prev => prev.map(g => (g.id === groupId ? { ...g, name } : g)))
    setRenamingGroupId(null)
  }

  const deleteGroup = async (groupId: string) => {
    // items cascade via FK
    await supabase.from('shopping_groups').delete().eq('id', groupId)
    setGroups(prev => prev.filter(g => g.id !== groupId))
    setItems(prev => prev.filter(it => it.group_id !== groupId))
    setDeleteGroupConfirm(null)
  }

  const mergeGroup = async (sourceId: string, targetId: string) => {
    const srcItems = itemsByGroup[sourceId] ?? []
    const tgtItems = itemsByGroup[targetId] ?? []

    const openByName = new Map<string, { id: string; amount_text: string | null }>()
    for (const it of tgtItems) {
      if (it.checked_at === null) {
        openByName.set(it.name.trim().toLowerCase(), { id: it.id, amount_text: it.amount_text })
      }
    }

    let nextSort = tgtItems.length > 0
      ? Math.max(...tgtItems.map(i => i.manual_sort_order)) + 1
      : 0

    for (const it of srcItems) {
      const nameKey = it.name.trim().toLowerCase()
      const match = openByName.get(nameKey)
      if (match && it.checked_at === null) {
        const newText = mergeAmountTexts(match.amount_text, it.amount_text)
        await supabase
          .from('shopping_items')
          .update({ amount_text: newText })
          .eq('id', match.id)
        await supabase.from('shopping_items').delete().eq('id', it.id)
        match.amount_text = newText
      } else {
        await supabase
          .from('shopping_items')
          .update({
            group_id: targetId,
            manual_sort_order: nextSort++,
          })
          .eq('id', it.id)
      }
    }

    await supabase.from('shopping_groups').delete().eq('id', sourceId)
    setMergeSource(null)
    fetchData()
  }

  // ---------------------------------------------------------------------------
  // Herhaalregel-suggesties
  // ---------------------------------------------------------------------------
  const dueRules = useMemo(() => rules.filter(r => isRuleDue(r)), [rules])

  const acceptSuggestion = async (rule: RecurringRule) => {
    if (!defaultGroup) return
    // Ruim de regel uit de lokale lijst weg zodat de suggestie direct verdwijnt
    setRules(prev => prev.map(r => (r.id === rule.id ? { ...r, last_triggered_at: new Date().toISOString() } : r)))

    // Zoek product voor schap-categorie
    let productId = rule.product_id
    let shopCategoryId: string | null = null
    if (productId) {
      const { data: prod } = await supabase
        .from('products')
        .select('shop_category_id')
        .eq('id', productId)
        .maybeSingle()
      shopCategoryId = prod?.shop_category_id ?? null
    } else {
      const resolved = await resolveProductForIngredient(supabase, rule.name)
      if (resolved) {
        productId = resolved.productId
        shopCategoryId = resolved.shopCategoryId
      } else {
        const overig = shopCategories.find(c => c.slug === 'overig')
        if (overig) {
          const { data: created } = await supabase
            .from('products')
            .insert({
              name: rule.name,
              name_normalized: rule.name.toLowerCase(),
              shop_category_id: overig.id,
              is_seed: false,
            })
            .select('id')
            .single()
          productId = created?.id ?? null
          shopCategoryId = overig.id
        }
      }
    }

    const defItems = itemsByGroup[defaultGroup.id] ?? []
    const maxSort = defItems.length > 0
      ? Math.max(...defItems.map(i => i.manual_sort_order))
      : -1

    const { data: inserted } = await supabase
      .from('shopping_items')
      .insert({
        group_id: defaultGroup.id,
        product_id: productId,
        name: rule.name,
        amount_text: rule.amount_text,
        shop_category_id: shopCategoryId,
        manual_sort_order: maxSort + 1,
      })
      .select('*, shop_category:shop_categories(*)')
      .single()

    if (inserted) setItems(prev => [...prev, inserted as ShoppingItem])

    await supabase
      .from('recurring_rules')
      .update({ last_triggered_at: new Date().toISOString() })
      .eq('id', rule.id)
  }

  const dismissSuggestion = async (rule: RecurringRule) => {
    setRules(prev => prev.map(r => (r.id === rule.id ? { ...r, last_triggered_at: new Date().toISOString() } : r)))
    await supabase
      .from('recurring_rules')
      .update({ last_triggered_at: new Date().toISOString() })
      .eq('id', rule.id)
  }

  // ---------------------------------------------------------------------------
  // Afgeleide waarden
  // ---------------------------------------------------------------------------
  const defaultItems = defaultGroup ? itemsByGroup[defaultGroup.id] ?? [] : []
  const checkedCount = items.filter(i => i.checked_at !== null).length

  // ---------------------------------------------------------------------------
  // Helper: rendert de actieve "Nieuw item…" invoerrij + suggestie-dropdown.
  // Wordt alleen gerenderd als de quick-add actief is voor deze groep; in rust
  // toont de groep-card in plaats daarvan een ronde mint-plus op de onderrand.
  // ---------------------------------------------------------------------------
  const renderActiveAddRow = (hasItemsAbove: boolean) => {
    return (
      <div className={cn('relative', hasItemsAbove && 'border-t border-gray-100')}>
        <div className="flex items-center gap-2 pl-1 pr-1">
          <span className="flex items-center justify-center p-3 shrink-0" aria-hidden>
            <span className="w-5 h-5 rounded border-2 border-gray-300" />
          </span>
          <input
            ref={quickInputRef}
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && quickName.trim() && !quickAdding) {
                e.preventDefault()
                quickAdd(quickName)
              } else if (e.key === 'Escape') {
                deactivateQuickAdd()
              }
            }}
            onBlur={() => {
              // Suggesties en de sluit-X gebruiken onMouseDown preventDefault,
              // dus die stelen de focus niet. Elke andere klik buiten de rij
              // sluit 'm netjes. Check via ref omdat setQuickAdding async is
              // en de closure-waarde anders stale kan zijn tijdens Enter→insert.
              if (!quickAddingRef.current) deactivateQuickAdd()
            }}
            placeholder="Nieuw item…"
            className="flex-1 py-2.5 bg-transparent text-[15px] placeholder:text-gray-400 outline-none min-w-0"
          />
          {quickAdding ? (
            <span
              className="h-4 w-4 border-2 border-mint-500 border-r-transparent rounded-full animate-spin shrink-0 mr-2"
              aria-hidden
            />
          ) : (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={deactivateQuickAdd}
              className="flex items-center justify-center p-3 shrink-0 text-gray-400 hover:text-gray-600"
              aria-label="Sluiten"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {quickName.trim().length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-xl border border-gray-200 shadow-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {quickSuggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => quickAdd(s.name, s)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-mint-50 text-left touch-manipulation"
              >
                <span className="flex-1 text-sm text-gray-900 truncate">{s.name}</span>
                {s.shop_category && (
                  <span
                    className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap',
                      shopCategoryPillClass(s.shop_category.slug)
                    )}
                  >
                    {s.shop_category.name}
                  </span>
                )}
              </button>
            ))}
            {!quickSuggestions.some(
              (s) => s.name.toLowerCase() === quickName.trim().toLowerCase()
            ) && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => quickAdd(quickName)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-mint-50 text-left touch-manipulation"
              >
                <Plus className="h-4 w-4 text-mint-600 shrink-0" />
                <span className="flex-1 text-sm text-gray-900 truncate">
                  <span className="font-medium">&ldquo;{quickName.trim()}&rdquo;</span>{' '}
                  als nieuw product
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-mint-100">
        <div className="loading-avatar w-20 h-20 rounded-2xl border-2 border-mint-300 shadow-sm">
          <img
            src="/logo.png"
            alt=""
            className="w-full h-full object-cover rounded-2xl"
          />
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
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="page-title truncate">Boodschappen</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={sortDefaultByCategory}
              disabled={defaultItems.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-mint-800 bg-white/70 hover:bg-white disabled:opacity-40 disabled:pointer-events-none border border-mint-300/60"
              title="Sorteer op loopvolgorde in de winkel"
            >
              <Route className="h-4 w-4" />
              <span className="hidden sm:inline">Loopvolgorde</span>
            </button>
            <button
              type="button"
              onClick={() => setCleanupOpen(true)}
              disabled={checkedCount === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-gray-700 bg-white/70 hover:bg-white disabled:opacity-40 disabled:pointer-events-none border border-gray-200"
              title="Afgevinkte items verwijderen"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">
                Opschonen{checkedCount > 0 ? ` (${checkedCount})` : ''}
              </span>
              <span className="sm:hidden">{checkedCount > 0 ? checkedCount : ''}</span>
            </button>
          </div>
        </div>

      </div>

      {/* Spacer onder fixed header */}
      <div className="h-16 sm:h-20 lg:h-24" aria-hidden />

      {/* Suggesties (herhaalregels die nu due zijn) */}
      {dueRules.length > 0 && (
        <section className="mt-2 mb-4">
          <h2 className="px-1 mb-2 text-xs uppercase tracking-wider text-gray-500 font-semibold">
            Suggesties
          </h2>
          <div className="bg-mint-50 rounded-2xl border border-mint-200 overflow-hidden">
            {dueRules.map((rule, i) => (
              <div
                key={rule.id}
                className={cn(
                  'flex items-center gap-2 px-3',
                  i > 0 && 'border-t border-mint-200'
                )}
              >
                <Repeat className="h-4 w-4 text-mint-600 shrink-0" />
                <div className="flex-1 min-w-0 py-2.5">
                  <div className="flex items-baseline gap-2">
                    {rule.amount_text && (
                      <span className="text-[11px] font-medium px-1.5 py-0.5 bg-white rounded shrink-0 tabular-nums">
                        {rule.amount_text}
                      </span>
                    )}
                    <span className="text-[15px] text-gray-900 truncate">{rule.name}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{describeRule(rule)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => acceptSuggestion(rule)}
                  className="flex items-center justify-center p-2.5 rounded-full bg-mint-500 text-mint-950 hover:bg-mint-600 shrink-0 touch-manipulation"
                  title={`Toevoegen aan ${defaultGroup?.name ?? 'lijst'}`}
                  aria-label={`Toevoegen aan ${defaultGroup?.name ?? 'lijst'}`}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={() => dismissSuggestion(rule)}
                  className="flex items-center justify-center p-2.5 text-gray-400 hover:text-gray-600 shrink-0 touch-manipulation"
                  title="Overslaan tot volgende keer"
                  aria-label="Overslaan"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Groepen — allemaal gelijkwaardig, behalve dat de default-groep
          niet verwijderd of samengevoegd kan worden. Eén DndContext omvat
          alle groepen, zodat items ook tussen groepen gesleept kunnen worden. */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
      {/* pb berekent: 5rem FAB-bottom + ~3.5rem voor FAB-hoogte + 28px voor
          de per-card "Nieuw item"-knop die onder de kaart uitsteekt. Zonder
          deze padding overlappen beide knoppen wanneer de lijst precies past. */}
      <section className="mt-2 space-y-10 pb-[calc(11rem+env(safe-area-inset-bottom,0px))]">
        {groups.map(group => {
          const groupItems = itemsByGroup[group.id] ?? []
          const isRenaming = renamingGroupId === group.id
          const isDefault = group.is_default
          const isAddActive = quickTargetGroupId === group.id

          const hasContentBelowHeader = groupItems.length > 0 || isAddActive

          return (
            <div key={group.id} className="relative">
              {/* Geen overflow-hidden hier — de typeahead-dropdown van de
                  quick-add staat absolute-positioned net onder het input-veld
                  en zou anders door de groep-card geclipt worden. */}
              <div className="bg-white rounded-2xl border border-gray-200">
              <div
                className={cn(
                  'flex items-center bg-mint-50/60 rounded-t-2xl',
                  hasContentBelowHeader && 'border-b border-gray-200'
                )}
              >
                <div className="flex-1 flex items-center gap-2 pl-4 py-3 min-w-0">
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renamingGroupName}
                      onChange={e => setRenamingGroupName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveRenameGroup(group.id)
                        if (e.key === 'Escape') setRenamingGroupId(null)
                      }}
                      onBlur={() => saveRenameGroup(group.id)}
                      className="flex-1 bg-transparent text-lg font-bold text-gray-900 outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startRenameGroup(group)}
                      className="flex items-baseline gap-1.5 min-w-0 text-left cursor-text"
                      title="Hernoemen"
                    >
                      <span className="text-lg font-bold text-gray-900 truncate">
                        {group.name}
                      </span>
                      <span className="text-[12px] text-gray-400 shrink-0 tabular-nums">
                        ({groupItems.length})
                      </span>
                    </button>
                  )}
                </div>
                {!isDefault && (
                  <button
                    type="button"
                    onClick={() => setMergeSource(group)}
                    disabled={groups.length < 2 || groupItems.length === 0}
                    className="flex items-center justify-center p-3 text-gray-400 hover:text-mint-700 disabled:opacity-30 disabled:pointer-events-none"
                    title="Samenvoegen met andere groep"
                  >
                    <Merge className="h-4 w-4" />
                  </button>
                )}
                {!isDefault && (
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteGroupConfirm({
                        groupId: group.id,
                        groupName: group.name,
                      })
                    }
                    className="flex items-center justify-center p-3 mr-1 text-gray-400 hover:text-red-500"
                    title="Verwijderen"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {isDefault && <div className="mr-1" />}
              </div>

              <GroupDropZone groupId={group.id}>
                {groupItems.length > 0 && (
                  <SortableContext
                    items={groupItems.map(i => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {groupItems.map(item => (
                      <SortableItem
                        key={item.id}
                        item={item}
                        supabase={supabase}
                        onToggle={toggleChecked}
                        onDelete={deleteItem}
                        onAmountSave={saveAmount}
                        onNameSave={saveName}
                      />
                    ))}
                  </SortableContext>
                )}
                {isAddActive && renderActiveAddRow(groupItems.length > 0)}
              </GroupDropZone>
              </div>

              <button
                type="button"
                onClick={() => activateQuickAdd(group.id)}
                className="absolute -bottom-7 right-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-mint-500 text-mint-950 shadow-md shadow-mint-900/25 hover:bg-mint-600 active:scale-95 transition-all touch-manipulation"
                aria-label={`Nieuw item in ${group.name}`}
                title={`Nieuw item in ${group.name}`}
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>
          )
        })}

        {/* Nieuwe groep — draft-card met naam-input */}
        {addingGroup && (
          <div className="bg-white rounded-2xl border border-mint-300">
            <div className="flex items-center border-b border-gray-200 bg-mint-50/60 rounded-t-2xl">
              <div className="flex-1 flex items-center gap-2 pl-4 py-3 min-w-0">
                <input
                  ref={newGroupInputRef}
                  autoFocus
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') createGroup()
                    if (e.key === 'Escape') {
                      setAddingGroup(false)
                      setNewGroupName('')
                    }
                  }}
                  onBlur={createGroup}
                  placeholder="Naam van de groep"
                  className="flex-1 bg-transparent text-lg font-bold text-gray-900 placeholder-gray-400 outline-none"
                />
              </div>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setAddingGroup(false)
                  setNewGroupName('')
                }}
                className="flex items-center justify-center p-3 mr-1 text-gray-400 hover:text-gray-700"
                title="Annuleren"
                aria-label="Annuleren"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 pl-1 pr-3 py-2.5">
              <span className="flex items-center justify-center p-3 shrink-0" aria-hidden>
                <Plus className="h-4 w-4 text-gray-200" strokeWidth={2.5} />
              </span>
              <span className="flex-1 text-[15px] text-gray-300 italic">
                Typ eerst een naam…
              </span>
            </div>
          </div>
        )}
      </section>
      </DndContext>

      {/* FAB — nieuwe groep */}
      {!addingGroup && (
        <button
          type="button"
          onClick={startAddGroup}
          data-hide-on-sheet
          className="fixed z-30 right-4 lg:right-8 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:bottom-8 flex items-center justify-center w-14 h-14 rounded-full bg-mint-500 text-mint-950 shadow-lg shadow-mint-900/30 hover:bg-mint-600 active:scale-95 transition-all touch-manipulation"
          aria-label="Nieuwe groep"
          title="Nieuwe groep"
        >
          <FolderPlus className="h-6 w-6" strokeWidth={2.5} />
        </button>
      )}

      {/* Opschoon-bevestiging */}
      <Modal
        open={cleanupOpen}
        onClose={() => setCleanupOpen(false)}
        title="Afgevinkte items verwijderen"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {checkedCount === 1
              ? '1 afgevinkt item wordt verwijderd.'
              : `${checkedCount} afgevinkte items worden verwijderd (alle groepen).`}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setCleanupOpen(false)}>
              Annuleren
            </Button>
            <Button variant="danger" onClick={cleanupChecked}>
              Verwijderen
            </Button>
          </div>
        </div>
      </Modal>

      {/* Groep verwijderen — bevestiging */}
      <Modal
        open={deleteGroupConfirm !== null}
        onClose={() => setDeleteGroupConfirm(null)}
        title="Groep verwijderen"
      >
        {deleteGroupConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">{deleteGroupConfirm.groupName}</span> en alle items erin worden verwijderd.
              {(itemsByGroup[deleteGroupConfirm.groupId]?.length ?? 0) > 0 &&
                ` Dit zijn ${itemsByGroup[deleteGroupConfirm.groupId].length} items.`}
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteGroupConfirm(null)}>
                Annuleren
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteGroup(deleteGroupConfirm.groupId)}
              >
                Verwijderen
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Groep samenvoegen — doelgroep-picker */}
      <BottomSheet
        open={mergeSource !== null}
        onClose={() => setMergeSource(null)}
        title={mergeSource ? `'${mergeSource.name}' samenvoegen met…` : ''}
      >
        {mergeSource && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Kies de groep waar de items naartoe gaan. Zelfde producten worden opgeteld, {mergeSource.name} wordt daarna verwijderd.
            </p>
            <div className="flex flex-col gap-1.5">
              {groups
                .filter(g => g.id !== mergeSource.id)
                .map(g => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => mergeGroup(mergeSource.id, g.id)}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 hover:bg-mint-50 text-left touch-manipulation transition-colors"
                  >
                    <span className="text-[15px] text-gray-900 font-medium">
                      {g.name}
                    </span>
                    <span className="text-[11px] text-gray-400 tabular-nums">
                      ({itemsByGroup[g.id]?.length ?? 0})
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { ChevronDown, Plus, Pencil, X, Check } from 'lucide-react'
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
import { revalidateCategoryCache } from './actions'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import type { Category, Subcategory } from '@/lib/types'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// Sortable subcategory row
// ─────────────────────────────────────────────────────────────────────────────
interface SortableSubProps {
  sub: Subcategory
  isEditing: boolean
  editingName: string
  setEditingName: (v: string) => void
  onStartEdit: (sub: Subcategory) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (sub: Subcategory) => void
}

function SortableSubRow({
  sub,
  isEditing,
  editingName,
  setEditingName,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: SortableSubProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sub.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto' as const,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'flex items-center gap-1 pl-10 pr-1 border-t border-gray-100 bg-gray-50/60 touch-none cursor-grab active:cursor-grabbing',
        isDragging && 'bg-white shadow-lg ring-1 ring-mint-300'
      )}
    >
      {isEditing ? (
        <input
          autoFocus
          value={editingName}
          onChange={e => setEditingName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSaveEdit(sub.id)
            if (e.key === 'Escape') onCancelEdit()
          }}
          onBlur={() => onSaveEdit(sub.id)}
          className="flex-1 bg-transparent text-[14px] text-gray-800 outline-none py-2.5"
        />
      ) : (
        <span className="flex-1 text-[14px] text-gray-700 py-2.5 truncate">
          {sub.name}
        </span>
      )}
      <button
        type="button"
        onClick={() => onStartEdit(sub)}
        className="flex items-center justify-center p-3 text-gray-400 hover:text-gray-700"
        title="Hernoemen"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(sub)}
        className="flex items-center justify-center p-3 text-gray-400 hover:text-red-500"
        title="Verwijderen"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sortable category row + expanded content
// ─────────────────────────────────────────────────────────────────────────────
interface SortableCategoryProps {
  cat: Category
  subs: Subcategory[]
  count: number
  isOpen: boolean
  onToggle: (id: string) => void
  isEditing: boolean
  editingName: string
  setEditingName: (v: string) => void
  onStartEdit: (cat: Category) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (cat: Category) => void
  children: React.ReactNode
}

function SortableCategoryRow({
  cat,
  count,
  isOpen,
  onToggle,
  isEditing,
  editingName,
  setEditingName,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  children,
}: SortableCategoryProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cat.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto' as const,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'border-t border-gray-100 first:border-t-0 bg-white',
        isDragging && 'shadow-lg ring-1 ring-mint-300 z-50'
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex items-center hover:bg-gray-50 transition-colors touch-none cursor-grab active:cursor-grabbing"
      >
        <button
          onClick={() => onToggle(cat.id)}
          className="flex-1 flex items-center gap-2 pl-4 py-2 text-left min-w-0"
          aria-expanded={isOpen}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 text-gray-400 shrink-0 transition-transform duration-200',
              isOpen ? 'rotate-0' : '-rotate-90'
            )}
          />
          {isEditing ? (
            <input
              autoFocus
              value={editingName}
              onChange={e => setEditingName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onSaveEdit(cat.id)
                if (e.key === 'Escape') onCancelEdit()
              }}
              onBlur={() => onSaveEdit(cat.id)}
              onClick={e => e.stopPropagation()}
              className="flex-1 bg-transparent text-[15px] text-gray-900 outline-none"
            />
          ) : (
            <span className="flex flex-col min-w-0">
              <span className="text-[15px] text-gray-900 truncate">{cat.name}</span>
              <span className="text-[11px] text-gray-400 mt-0.5">
                {count} {count === 1 ? 'recept' : 'recepten'}
              </span>
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onStartEdit(cat)}
          className="flex items-center justify-center p-3 text-gray-400 hover:text-gray-700"
          title="Hernoemen"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(cat)}
          className="flex items-center justify-center p-3 mr-1 text-gray-400 hover:text-red-500"
          title="Verwijderen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {isOpen && children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel: categorieën-beheer (geen eigen wrapper, wordt door de tab-pagina gerend)
// ─────────────────────────────────────────────────────────────────────────────
export function CategoriesPanel() {
  const supabase = createClient()
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [recipeCounts, setRecipeCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())

  // Inline nieuwe-categorie draft
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const newCategoryInputRef = useRef<HTMLInputElement>(null)

  // Delete confirmation
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean
    type?: 'category' | 'subcategory'
    id?: string
    name?: string
  }>({ open: false })

  // Inline rename state
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [editingSubId, setEditingSubId] = useState<string | null>(null)
  const [editingSubName, setEditingSubName] = useState('')

  // Inline subcategory add
  const [addingSubForCat, setAddingSubForCat] = useState<string | null>(null)
  const [newSubName, setNewSubName] = useState('')
  const addSubInputRef = useRef<HTMLInputElement>(null)

  const [saving, setSaving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const fetchData = useCallback(async () => {
    const [{ data: cats }, { data: subs }, { data: recipes }] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('subcategories').select('*').order('sort_order'),
      supabase.from('recipes').select('category_id'),
    ])
    setCategories(cats || [])
    setSubcategories(subs || [])

    const counts: Record<string, number> = {}
    if (recipes) {
      for (const r of recipes) {
        counts[r.category_id] = (counts[r.category_id] || 0) + 1
      }
    }
    setRecipeCounts(counts)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleCategory = (id: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setEditingSubId(null)
    setAddingSubForCat(null)
  }

  // --- Add category (inline draft-rij onderaan de lijst) ---
  const startAddCategory = () => {
    setNewCategoryName('')
    setAddingCategory(true)
    setTimeout(() => newCategoryInputRef.current?.focus(), 0)
  }

  const createCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) {
      setAddingCategory(false)
      setNewCategoryName('')
      return
    }
    setSaving(true)
    const slug = slugify(name)
    const maxOrder = categories.length > 0
      ? Math.max(...categories.map(c => c.sort_order))
      : -1
    await supabase
      .from('categories')
      .insert({ name, slug, sort_order: maxOrder + 1 })
    await revalidateCategoryCache()
    setSaving(false)
    setAddingCategory(false)
    setNewCategoryName('')
    fetchData()
  }

  // --- Rename category inline ---
  const startEditCategory = (cat: Category) => {
    setEditingCatId(cat.id)
    setEditingCatName(cat.name)
  }

  const saveEditCategory = async (id: string) => {
    const name = editingCatName.trim()
    if (!name) {
      setEditingCatId(null)
      return
    }
    // No change? skip roundtrip
    const existing = categories.find(c => c.id === id)
    if (existing && existing.name === name) {
      setEditingCatId(null)
      return
    }
    await supabase
      .from('categories')
      .update({ name, slug: slugify(name) })
      .eq('id', id)
    await revalidateCategoryCache()
    setEditingCatId(null)
    fetchData()
  }

  // --- Delete ---
  const confirmDelete = async () => {
    if (!deleteModal.id) return
    setSaving(true)
    const table = deleteModal.type === 'category' ? 'categories' : 'subcategories'
    await supabase.from(table).delete().eq('id', deleteModal.id)
    await revalidateCategoryCache()
    setSaving(false)
    setDeleteModal({ open: false })
    if (deleteModal.type === 'category') {
      setOpenCategories(prev => {
        const next = new Set(prev)
        next.delete(deleteModal.id!)
        return next
      })
    }
    fetchData()
  }

  // --- Subcategory inline add ---
  const startAddSub = (categoryId: string) => {
    setAddingSubForCat(categoryId)
    setNewSubName('')
    setTimeout(() => addSubInputRef.current?.focus(), 0)
  }

  const saveNewSub = async (categoryId: string) => {
    const name = newSubName.trim()
    if (!name) {
      setAddingSubForCat(null)
      return
    }
    const subs = subcategoriesByCategoryId[categoryId] || []
    const maxOrder = subs.length > 0 ? Math.max(...subs.map(s => s.sort_order)) : -1
    await supabase.from('subcategories').insert({
      name,
      slug: slugify(name),
      category_id: categoryId,
      sort_order: maxOrder + 1,
    })
    await revalidateCategoryCache()
    setAddingSubForCat(null)
    setNewSubName('')
    fetchData()
  }

  // --- Subcategory inline rename ---
  const startEditSub = (sub: Subcategory) => {
    setEditingSubId(sub.id)
    setEditingSubName(sub.name)
  }

  const saveEditSub = async (subId: string) => {
    const name = editingSubName.trim()
    if (!name) {
      setEditingSubId(null)
      return
    }
    const existing = subcategories.find(s => s.id === subId)
    if (existing && existing.name === name) {
      setEditingSubId(null)
      return
    }
    await supabase
      .from('subcategories')
      .update({ name, slug: slugify(name) })
      .eq('id', subId)
    await revalidateCategoryCache()
    setEditingSubId(null)
    fetchData()
  }

  // --- Drag reorder ---
  const persistOrder = async (
    table: 'categories' | 'subcategories',
    ordered: { id: string }[]
  ) => {
    await Promise.all(
      ordered.map((item, i) =>
        supabase.from(table).update({ sort_order: i }).eq('id', item.id)
      )
    )
    await revalidateCategoryCache()
  }

  const handleCategoryDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = categories.findIndex(c => c.id === active.id)
    const newIndex = categories.findIndex(c => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(categories, oldIndex, newIndex).map((c, i) => ({
      ...c,
      sort_order: i,
    }))
    setCategories(reordered)
    persistOrder('categories', reordered)
  }

  const handleSubDragEnd = (categoryId: string) => async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const subs = subcategoriesByCategoryId[categoryId] || []
    const oldIndex = subs.findIndex(s => s.id === active.id)
    const newIndex = subs.findIndex(s => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(subs, oldIndex, newIndex).map((s, i) => ({
      ...s,
      sort_order: i,
    }))
    const otherSubs = subcategories.filter(s => s.category_id !== categoryId)
    setSubcategories([...otherSubs, ...reordered])
    persistOrder('subcategories', reordered)
  }

  const subcategoriesByCategoryId = subcategories.reduce<Record<string, Subcategory[]>>(
    (acc, sub) => {
      (acc[sub.category_id] ||= []).push(sub)
      return acc
    },
    {}
  )

  if (loading) {
    return <p className="text-sm text-gray-400">Laden&hellip;</p>
  }

  return (
    <>
      <section className="mt-2">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {categories.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleCategoryDragEnd}
            >
              <SortableContext
                items={categories.map(c => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {categories.map(cat => {
                  const subs = subcategoriesByCategoryId[cat.id] || []
                  const isOpen = openCategories.has(cat.id)
                  const count = recipeCounts[cat.id] || 0

                  return (
                    <SortableCategoryRow
                      key={cat.id}
                      cat={cat}
                      subs={subs}
                      count={count}
                      isOpen={isOpen}
                      onToggle={toggleCategory}
                      isEditing={editingCatId === cat.id}
                      editingName={editingCatName}
                      setEditingName={setEditingCatName}
                      onStartEdit={startEditCategory}
                      onSaveEdit={saveEditCategory}
                      onCancelEdit={() => setEditingCatId(null)}
                      onDelete={c =>
                        setDeleteModal({
                          open: true,
                          type: 'category',
                          id: c.id,
                          name: c.name,
                        })
                      }
                    >
                      <div className="bg-gray-50/60">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleSubDragEnd(cat.id)}
                        >
                          <SortableContext
                            items={subs.map(s => s.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {subs.map(sub => (
                              <SortableSubRow
                                key={sub.id}
                                sub={sub}
                                isEditing={editingSubId === sub.id}
                                editingName={editingSubName}
                                setEditingName={setEditingSubName}
                                onStartEdit={startEditSub}
                                onSaveEdit={saveEditSub}
                                onCancelEdit={() => setEditingSubId(null)}
                                onDelete={s =>
                                  setDeleteModal({
                                    open: true,
                                    type: 'subcategory',
                                    id: s.id,
                                    name: s.name,
                                  })
                                }
                              />
                            ))}
                          </SortableContext>
                        </DndContext>

                        {/* Toevoegen / inline-invoer-rij */}
                        <div className="flex items-center gap-1 pl-10 pr-3 py-2 border-t border-gray-100">
                          {addingSubForCat === cat.id ? (
                            <>
                              <input
                                ref={addSubInputRef}
                                value={newSubName}
                                onChange={e => setNewSubName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveNewSub(cat.id)
                                  if (e.key === 'Escape') setAddingSubForCat(null)
                                }}
                                onBlur={() => saveNewSub(cat.id)}
                                placeholder="Naam subcategorie"
                                className="flex-1 bg-transparent text-[14px] text-gray-800 placeholder-gray-400 outline-none"
                              />
                              <button
                                type="button"
                                onPointerDown={e => e.preventDefault()}
                                onClick={() => saveNewSub(cat.id)}
                                className="p-2 rounded-md text-mint-700 hover:text-mint-800 hover:bg-mint-50"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startAddSub(cat.id)}
                              className="flex-1 flex items-center gap-1.5 text-[14px] text-mint-700 hover:text-mint-800 text-left py-2"
                            >
                              <Plus className="h-4 w-4" />
                              Subcategorie toevoegen
                            </button>
                          )}
                        </div>
                      </div>
                    </SortableCategoryRow>
                  )
                })}
              </SortableContext>
            </DndContext>
          )}

          {/* Inline nieuwe-categorie draft-rij */}
          {addingCategory && (
            <div
              className={cn(
                'flex items-center gap-2 pl-4 pr-1',
                categories.length > 0 && 'border-t border-gray-100'
              )}
            >
              <input
                ref={newCategoryInputRef}
                autoFocus
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') createCategory()
                  if (e.key === 'Escape') {
                    setAddingCategory(false)
                    setNewCategoryName('')
                  }
                }}
                onBlur={createCategory}
                placeholder="Naam categorie"
                className="flex-1 bg-transparent text-[15px] text-gray-900 placeholder-gray-400 outline-none py-2.5"
              />
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setAddingCategory(false)
                  setNewCategoryName('')
                }}
                className="flex items-center justify-center p-3 mr-1 text-gray-400 hover:text-gray-700"
                title="Annuleren"
                aria-label="Annuleren"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Lege-state wanneer er geen categorieën zijn en geen draft */}
          {categories.length === 0 && !addingCategory && (
            <p className="px-4 py-8 text-sm text-gray-400 text-center">
              Nog geen categorie&euml;n. Tik op + om er een aan te maken.
            </p>
          )}
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModal.open}
        onClose={() => setDeleteModal({ open: false })}
        title={
          deleteModal.type === 'category'
            ? 'Categorie verwijderen'
            : 'Subcategorie verwijderen'
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Weet je zeker dat je <span className="font-semibold">{deleteModal.name}</span> wil verwijderen?
            {deleteModal.type === 'category' && deleteModal.id && recipeCounts[deleteModal.id] > 0 && (
              <> Er {recipeCounts[deleteModal.id] === 1 ? 'is' : 'zijn'} {recipeCounts[deleteModal.id]} {recipeCounts[deleteModal.id] === 1 ? 'recept' : 'recepten'} gekoppeld aan deze categorie.</>
            )}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteModal({ open: false })}>
              Annuleren
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              loading={saving}
            >
              Verwijderen
            </Button>
          </div>
        </div>
      </Modal>

      {/* FAB — nieuwe categorie (opent inline draft-rij onderaan de lijst) */}
      {!addingCategory && (
        <button
          type="button"
          onClick={startAddCategory}
          className="fixed z-30 right-4 lg:right-8 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:bottom-8 flex items-center justify-center w-14 h-14 rounded-full bg-mint-500 text-mint-950 shadow-lg shadow-mint-900/30 hover:bg-mint-600 active:scale-95 transition-all touch-manipulation"
          aria-label="Nieuwe categorie"
          title="Nieuwe categorie"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </button>
      )}
    </>
  )
}

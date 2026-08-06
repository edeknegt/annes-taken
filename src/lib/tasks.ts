import type { TaskCategory } from './types'

export const TASK_CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'huishouden', label: 'Huishouden' },
  { value: 'werk', label: 'Werk' },
  { value: 'inkopen', label: 'Inkopen' },
  { value: 'cadeaus', label: 'Cadeaus' },
  { value: 'berichten', label: 'Berichten' },
  { value: 'overig', label: 'Overig' },
]

export function taskCategoryLabel(category: TaskCategory): string {
  return TASK_CATEGORIES.find(c => c.value === category)?.label ?? category
}

// Alle categorieën ondersteunen terugkerende taakregels.
export const TASK_RULE_CATEGORIES = TASK_CATEGORIES

// Kleurtje voor de categorie-badge op een taak (Vandaag/Later-scherm) en de
// filterchips — puur decoratief, geen andere betekenis.
export const CATEGORY_BADGE_CLASS: Record<TaskCategory, string> = {
  huishouden: 'bg-mint-100 text-mint-700',
  werk: 'bg-sky-100 text-sky-700',
  inkopen: 'bg-amber-100 text-amber-700',
  cadeaus: 'bg-pink-100 text-pink-700',
  berichten: 'bg-violet-100 text-violet-700',
  overig: 'bg-gray-100 text-gray-600',
}

import type { TaskCategory } from './types'

export const TASK_CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'huishouden', label: 'Huishouden' },
  { value: 'werk', label: 'Werk' },
  { value: 'inkopen', label: 'Inkopen' },
  { value: 'cadeaus', label: 'Cadeaus' },
  { value: 'overig', label: 'Overig' },
]

export function taskCategoryLabel(category: TaskCategory): string {
  return TASK_CATEGORIES.find(c => c.value === category)?.label ?? category
}

// Alle categorieën ondersteunen terugkerende taakregels.
export const TASK_RULE_CATEGORIES = TASK_CATEGORIES

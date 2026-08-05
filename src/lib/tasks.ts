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

// Categorieën die zelf terugkerende taakregels ondersteunen. Inkopen en
// Overig hebben geen taakregels nodig — daar voeg je gewoon losse taken toe.
export const TASK_RULE_CATEGORIES = TASK_CATEGORIES.filter(
  c => c.value === 'huishouden' || c.value === 'werk' || c.value === 'cadeaus'
)

import type { TaskCategory } from './types'

export const TASK_CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'huishouden', label: 'Huishouden' },
  { value: 'werk', label: 'Werk' },
  { value: 'inkopen', label: 'Inkopen' },
  { value: 'cadeaus', label: 'Cadeaus & Kaarten' },
  { value: 'berichten', label: 'Berichten' },
  { value: 'overig', label: 'Overig' },
]

export function taskCategoryLabel(category: TaskCategory): string {
  return TASK_CATEGORIES.find(c => c.value === category)?.label ?? category
}

// Alle categorieën ondersteunen terugkerende taakregels.
export const TASK_RULE_CATEGORIES = TASK_CATEGORIES

// Beperktere set voor de filterchips boven Vandaag/Later — Cadeaus & Kaarten
// en Overig blijven wel bestaan als categorie (badge, Beheer), maar zijn
// geen apart filterknopje meer.
export const FILTER_CATEGORIES = TASK_CATEGORIES.filter(
  c => c.value === 'huishouden' || c.value === 'werk' || c.value === 'inkopen' || c.value === 'berichten'
)

// Kleurtje voor de categorie-badge op een taak (Vandaag/Later-scherm) en de
// filterchips — puur decoratief, geen andere betekenis. Pastel (lichte
// achtergrond), maar op maximaal uit elkaar liggende kleurfamilies (groen/
// blauw/oranje/rood/geel/grijs), met stevig donkere tekstkleur (900 i.p.v.
// 700) zodat het onderscheid vooral via helder/donker-contrast loopt — dat
// blijft ook bij kleurenblindheid overeind, puur op tint lukt dat niet.
export const CATEGORY_BADGE_CLASS: Record<TaskCategory, string> = {
  huishouden: 'bg-green-200 text-green-900',
  werk: 'bg-blue-200 text-blue-900',
  inkopen: 'bg-orange-200 text-orange-900',
  cadeaus: 'bg-red-200 text-red-900',
  berichten: 'bg-yellow-200 text-yellow-900',
  overig: 'bg-gray-200 text-gray-700',
}

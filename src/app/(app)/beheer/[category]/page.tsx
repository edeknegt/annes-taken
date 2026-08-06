import { TASK_CATEGORIES } from '@/lib/tasks'
import { BeheerPageClient } from './beheer-page-client'

// Alle categorieën zijn vooraf bekend (vaste set) — statisch prerenderen.
export function generateStaticParams() {
  return TASK_CATEGORIES.map(c => ({ category: c.value }))
}

export default function BeheerCategoryPage() {
  return <BeheerPageClient />
}

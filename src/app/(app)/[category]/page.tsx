import { TASK_CATEGORIES } from '@/lib/tasks'
import { CategoryPageClient } from './category-page-client'

// Alle categorieën zijn vooraf bekend (vaste set, geen user-generated
// slugs) — statisch prerenderen zoals Anne's keuken's losse routebestanden
// per tab (/lijst, /recepten, ...) i.p.v. één dynamic segment dat pas op
// aanvraag wordt gerenderd. Dat maakt tikken op een nav-tab hier net zo
// direct als daar.
export function generateStaticParams() {
  return TASK_CATEGORIES.map(c => ({ category: c.value }))
}

export default function CategoryPage() {
  return <CategoryPageClient />
}

export interface Category {
  id: string
  name: string
  slug: string
  sort_order: number
  created_at: string
}

export interface Subcategory {
  id: string
  name: string
  slug: string
  category_id: string
  sort_order: number
  created_at: string
  category?: Category
}

// ---------------------------------------------------------------------------
// Shopping list
// ---------------------------------------------------------------------------

export interface ShopCategory {
  id: string
  name: string
  slug: string
  sort_order: number
  created_at: string
}

export interface Product {
  id: string
  name: string
  name_normalized: string
  shop_category_id: string
  is_seed: boolean
  created_at: string
  shop_category?: ShopCategory
}

export interface ShoppingGroup {
  id: string
  name: string
  is_default: boolean
  sort_order: number
  created_at: string
}

export interface ShoppingItem {
  id: string
  group_id: string
  product_id: string | null
  name: string
  amount_text: string | null
  shop_category_id: string | null
  manual_sort_order: number
  checked_at: string | null
  created_at: string
  updated_at: string
  shop_category?: ShopCategory | null
}

export type RecurringRuleType = 'weekly' | 'monthly' | 'interval'

export interface RecurringRule {
  id: string
  product_id: string | null
  name: string
  amount_text: string | null
  rule_type: RecurringRuleType
  interval_n: number
  day_of_week: number | null
  day_of_month: number | null
  last_triggered_at: string | null
  active: boolean
  created_at: string
}

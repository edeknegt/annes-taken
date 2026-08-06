// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskCategory = 'huishouden' | 'werk' | 'inkopen' | 'cadeaus' | 'overig' | 'berichten'

export interface Task {
  id: string
  category: TaskCategory
  name: string
  description: string | null
  manual_sort_order: number
  checked_at: string | null
  task_rule_id: string | null
  today: boolean
  created_at: string
  updated_at: string
}

export type RecurringRuleType = 'fixed' | 'after_completion' | 'yearly' | 'workday' | 'after_workday' | 'once'
export type RecurUnit = 'day' | 'week' | 'month'
export type ShiftType = 'dienst' | 'spreekuur'

export interface TaskRule {
  id: string
  category: TaskCategory
  name: string
  description: string | null
  rule_type: RecurringRuleType
  interval_n: number
  recur_unit: RecurUnit | null
  first_due_at: string | null
  day_of_month: number | null
  weekday: number | null
  month: number | null
  birth_year: number | null
  shift_type: ShiftType | null
  gift: boolean
  card: boolean
  last_triggered_at: string | null
  active: boolean
  created_at: string
}

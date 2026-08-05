// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskCategory = 'huishouden' | 'werk' | 'inkopen' | 'cadeaus' | 'overig'

export interface Task {
  id: string
  category: TaskCategory
  name: string
  manual_sort_order: number
  checked_at: string | null
  task_rule_id: string | null
  created_at: string
  updated_at: string
}

export type RecurringRuleType = 'fixed' | 'after_completion' | 'yearly' | 'workday' | 'after_workday'
export type RecurUnit = 'day' | 'week' | 'month'
export type ShiftType = 'dienst' | 'spreekuur'

export interface TaskRule {
  id: string
  category: TaskCategory
  name: string
  rule_type: RecurringRuleType
  interval_n: number
  recur_unit: RecurUnit | null
  first_due_at: string | null
  day_of_month: number | null
  month: number | null
  shift_type: ShiftType | null
  gift: boolean
  card: boolean
  last_triggered_at: string | null
  active: boolean
  created_at: string
}

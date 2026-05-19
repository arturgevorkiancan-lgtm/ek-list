import { CheckCircle, Circle, XCircle, type LucideIcon } from 'lucide-react'

export type TriStateStatus = 'done' | 'pending' | 'na'

export function checklistItemRowClass(status: TriStateStatus): string {
  if (status === 'done') return 'bg-green-50 border-green-200 text-green-800'
  if (status === 'pending') return 'bg-red-50 border-red-200 text-red-800'
  return 'bg-gray-50 border-gray-200 text-gray-600'
}

export function checklistStatusIcon(status: TriStateStatus): {
  Icon: LucideIcon
  iconClass: string
} {
  if (status === 'done') return { Icon: CheckCircle, iconClass: 'text-green-600' }
  if (status === 'pending') return { Icon: XCircle, iconClass: 'text-red-600' }
  return { Icon: Circle, iconClass: 'text-gray-400' }
}

export function rangeValueClass(inRange: boolean | null): string {
  if (inRange === null) return 'border-slate-300'
  return inRange
    ? 'border-green-200 bg-green-50 text-green-800'
    : 'border-red-200 bg-red-50 text-red-800'
}

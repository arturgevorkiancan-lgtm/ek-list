import {
  COMPLIANCE_REQUIREMENTS,
  getApplicableComplianceItems,
  getComplianceTotal,
  warehouseHasStock,
} from '../data/warehouseComplianceTemplate'

export type ComplianceItemStatus = 'pending' | 'done' | 'na'

export type ComplianceItemState = {
  status?: ComplianceItemStatus
  comment?: string
}

export type ComplianceState = Record<string, ComplianceItemState>

export const WAREHOUSE_COMPLIANCE_CHANGED = 'warehouse-compliance-changed'

export const COMPLIANCE_ITEM_IDS = COMPLIANCE_REQUIREMENTS.map((i) => i.id)

/** Базовое число пунктов 289н + ЕГАИС без остатков продукции */
export const COMPLIANCE_TOTAL_BASE = getComplianceTotal(false)

export function complianceStorageKey(warehouseId: string): string {
  return `compliance_${warehouseId}`
}

export function readComplianceState(warehouseId: string): ComplianceState {
  try {
    const raw = localStorage.getItem(complianceStorageKey(warehouseId))
    return raw ? (JSON.parse(raw) as ComplianceState) : {}
  } catch {
    return {}
  }
}

export function notifyComplianceChanged(warehouseId: string): void {
  window.dispatchEvent(
    new CustomEvent(WAREHOUSE_COMPLIANCE_CHANGED, { detail: { warehouseId } }),
  )
}

export type WarehouseComplianceBadge = {
  text: string
  className: string
  tooltip: string
  done: number
}

export function countComplianceDone(
  warehouseId: string,
  hasStock = false,
): number {
  const state = readComplianceState(warehouseId)
  const ids = getApplicableComplianceItems(hasStock).map((i) => i.id)
  return ids.filter((id) => state[id]?.status === 'done').length
}

export function getWarehouseComplianceBadge(
  warehouseId: string,
  hasStock = false,
): WarehouseComplianceBadge {
  const grayBadge = 'bg-slate-100 border border-slate-200 text-slate-600'
  const redBadge = 'bg-red-50 border border-red-200 text-red-800'
  const greenBadge = 'bg-green-50 border border-green-200 text-green-800'
  const amberBadge = 'bg-amber-50 border border-amber-200 text-amber-800'

  const total = getComplianceTotal(hasStock)
  const applicableIds = getApplicableComplianceItems(hasStock).map((i) => i.id)

  try {
    const state = readComplianceState(warehouseId)

    let applicable = 0
    let done = 0
    let explicitPending = 0

    for (const id of applicableIds) {
      const status = state[id]?.status ?? 'pending'
      if (status === 'na') continue
      applicable++
      if (status === 'done') done++
      if (status === 'pending' && id in state) explicitPending++
    }

    if (applicable === 0) {
      return {
        text: 'Требует проверки',
        className: amberBadge,
        tooltip: `Частично выполнено (0/${total})`,
        done: 0,
      }
    }

    if (done === applicable) {
      return {
        text: 'Соответствует',
        className: greenBadge,
        tooltip: `Все требования выполнены (${done}/${total})`,
        done,
      }
    }

    if (done === 0 && explicitPending === 0) {
      return {
        text: 'Не заполнен',
        className: grayBadge,
        tooltip: `Чеклист не заполнен (0/${total})`,
        done: 0,
      }
    }

    if (done === 0 && explicitPending > 0) {
      return {
        text: 'Не соответствует',
        className: redBadge,
        tooltip: `Не выполнено пунктов: ${explicitPending} из ${total}`,
        done: 0,
      }
    }

    return {
      text: 'Требует проверки',
      className: amberBadge,
      tooltip: `Частично выполнено (${done}/${total})`,
      done,
    }
  } catch {
    return {
      text: 'Требует проверки',
      className: amberBadge,
      tooltip: `Частично выполнено (0/${total})`,
      done: 0,
    }
  }
}

export { warehouseHasStock, getComplianceTotal }

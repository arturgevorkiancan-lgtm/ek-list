import type { ChecklistTemplateItem, OperationType, ProductTypeFlag } from '../types'
import {
  getItemsForOperation,
  LICENSING_ITEMS,
  OPERATION_LABELS,
} from './licensingChecklistTemplate'

export { OPERATION_LABELS }

/** Legacy Supabase checklist template — derived from licensing checklist */
export const CHECKLIST_ITEMS: ChecklistTemplateItem[] = LICENSING_ITEMS.filter(
  (item) => item.mode !== 'info',
).map((item) => ({
  block: item.block,
  id: item.id,
  title: item.title,
  note: item.note,
  types: item.operationTypes,
}))

export const BLOCK_TITLES: Record<number, string> = {
  1: 'Корпоративные документы',
  2: 'Уставный капитал',
  3: 'Реестры и выписки',
  5: 'Зонирование и размещение',
  6: 'ЕГАИС (организация)',
  7: 'Лицензия',
  8: 'Подготовка к проверке',
  9: 'Уведомления для заказчика',
}

export function getItemsForChecklist(
  operationType: OperationType,
  productTypes: ProductTypeFlag[] = [],
): ChecklistTemplateItem[] {
  return getItemsForOperation(operationType)
    .filter((item) => item.mode !== 'info')
    .map((item) => {
      const mapped: ChecklistTemplateItem = {
        block: item.block,
        id: item.id,
        title: item.title,
        note: item.note,
        types: item.operationTypes,
      }
      return mapped
    })
    .filter((item) => {
      if (item.conditional === 'customs_warehouse' && !productTypes.includes('customs_warehouse')) {
        return false
      }
      if (item.conditional === 'has_stock' && !productTypes.includes('has_stock')) {
        return false
      }
      return true
    })
}

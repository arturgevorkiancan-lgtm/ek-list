import type { OperationType } from '../types'

export type ChecklistItemMode = 'manual' | 'auto' | 'form' | 'info'

export const OPERATION_OPTIONS: {
  value: OperationType
  label: string
  description: string
}[] = [
  { value: 'ПОЛУЧЕНИЕ', label: 'ПОЛУЧЕНИЕ', description: 'новая лицензия' },
  {
    value: 'ПЕРЕОФОРМЛЕНИЕ',
    label: 'ПЕРЕОФОРМЛЕНИЕ',
    description: 'смена адреса / наименования / реорганизация',
  },
  { value: 'ПРОДЛЕНИЕ', label: 'ПРОДЛЕНИЕ', description: 'продление срока лицензии' },
  { value: 'ПРОВЕРКА_ВЫЕЗДНАЯ', label: 'ПРОВЕРКА_ВЫЕЗДНАЯ', description: 'выездная оценка РАТК' },
  {
    value: 'ПРОВЕРКА_ВНЕПЛАНОВАЯ',
    label: 'ПРОВЕРКА_ВНЕПЛАНОВАЯ',
    description: 'внеплановая проверка',
  },
]

export const OPERATION_LABELS: Record<OperationType, string> = {
  ПОЛУЧЕНИЕ: 'Получение лицензии',
  ПЕРЕОФОРМЛЕНИЕ: 'Переоформление',
  ПРОДЛЕНИЕ: 'Продление',
  ПРОВЕРКА_ВЫЕЗДНАЯ: 'Выездная проверка РАТК',
  ПРОВЕРКА_ВНЕПЛАНОВАЯ: 'Внеплановая проверка',
}

export const LICENSE_BLOCK_OPS: OperationType[] = [
  'ПЕРЕОФОРМЛЕНИЕ',
  'ПРОДЛЕНИЕ',
  'ПРОВЕРКА_ВЫЕЗДНАЯ',
  'ПРОВЕРКА_ВНЕПЛАНОВАЯ',
]

export const INSPECTION_OPS: OperationType[] = ['ПРОВЕРКА_ВЫЕЗДНАЯ', 'ПРОВЕРКА_ВНЕПЛАНОВАЯ']

export interface LicensingBlockDef {
  num: number
  title: string
  operationTypes?: OperationType[]
  /** Block visible but shows deferred placeholder (e.g. license on ПОЛУЧЕНИЕ) */
  deferredForOperations?: OperationType[]
}

export interface LicensingItemDef {
  id: number
  block: number
  title: string
  note?: string
  mode: ChecklistItemMode
  operationTypes?: OperationType[]
}

export const LICENSING_BLOCKS: LicensingBlockDef[] = [
  { num: 1, title: 'Корпоративные документы' },
  { num: 2, title: 'Уставный капитал' },
  { num: 3, title: 'Реестры и выписки' },
  { num: 5, title: 'Зонирование и размещение' },
  { num: 6, title: 'ЕГАИС (организация)' },
  { num: 7, title: 'Лицензия', deferredForOperations: ['ПОЛУЧЕНИЕ'] },
  { num: 8, title: 'Подготовка к проверке', operationTypes: INSPECTION_OPS },
  { num: 9, title: 'Уведомления для заказчика' },
]

export const LICENSING_ITEMS: LicensingItemDef[] = [
  { id: 1, block: 1, title: 'Устав (последняя редакция)', mode: 'manual' },
  { id: 2, block: 1, title: 'Свидетельство ОГРН / Лист записи ЕГРЮЛ', mode: 'manual' },
  { id: 3, block: 1, title: 'Свидетельство ИНН', mode: 'manual' },
  {
    id: 4,
    block: 1,
    title: 'Лист записи ГРН к Уставу (при наличии изменений)',
    mode: 'manual',
    note: 'при наличии',
  },
  { id: 5, block: 1, title: 'Решение о создании юридического лица', mode: 'manual' },
  {
    id: 6,
    block: 1,
    title: 'Решение об увеличении уставного капитала (при наличии)',
    mode: 'manual',
    note: 'при наличии',
  },
  {
    id: 7,
    block: 1,
    title: 'Решение о внесении изменений в Устав (при наличии)',
    mode: 'manual',
    note: 'при наличии',
  },
  { id: 8, block: 1, title: 'Решение о назначении генерального директора', mode: 'manual' },
  { id: 9, block: 1, title: 'Приказ о назначении генерального директора', mode: 'manual' },
  {
    id: 10,
    block: 1,
    title: 'Копия паспорта генерального директора (стр. 1 и прописка)',
    mode: 'manual',
  },
  {
    id: 11,
    block: 1,
    title: 'Приказ о назначении главного бухгалтера (если бухгалтер ≠ ГД)',
    mode: 'manual',
    note: 'если бухгалтер ≠ ГД',
  },
  { id: 12, block: 2, title: 'Платёжные документы об оплате УК', mode: 'manual' },
  { id: 13, block: 2, title: 'Справка банка о зачислении средств в оплату УК', mode: 'manual' },
  {
    id: 14,
    block: 2,
    title: 'Баланс за последний отчётный период (если компания открыта ранее текущего года)',
    mode: 'manual',
    note: 'при необходимости',
  },
  { id: 15, block: 2, title: 'Расчёт оценки стоимости чистых активов', mode: 'manual' },
  {
    id: 16,
    block: 3,
    title: 'Выписка из ЕГРЮЛ (не старше 1 месяца)',
    mode: 'auto',
    note: 'загрузка на вкладке «Документы и склады»',
  },
  {
    id: 17,
    block: 3,
    title: 'Выписка из ЕГРН (Росреестр)',
    mode: 'auto',
    note: 'по каждому складу — вкладка «Документы и склады»',
  },
  {
    id: 50,
    block: 5,
    title: 'Письмо о зонировании',
    mode: 'form',
    note: 'шаблон + файл для отправки клиенту',
  },
  {
    id: 51,
    block: 5,
    title: 'План расстановки / зонирование',
    mode: 'manual',
    note: 'при наличии',
  },
  {
    id: 52,
    block: 5,
    title: 'Письмо об отсутствии совместного хранения',
    mode: 'form',
    note: 'если есть иная продукция',
  },
  { id: 28, block: 6, title: 'Договор с ОФД', mode: 'manual' },
  {
    id: 31,
    block: 7,
    title: 'Действующая лицензия (оригинал или копия)',
    mode: 'auto',
    operationTypes: LICENSE_BLOCK_OPS,
  },
  {
    id: 32,
    block: 7,
    title: 'Предыдущие лицензии (при наличии, для истории)',
    mode: 'manual',
    operationTypes: LICENSE_BLOCK_OPS,
    note: 'при наличии',
  },
  {
    id: 80,
    block: 8,
    title: 'Журнал учёта условий хранения (ведётся, актуален)',
    mode: 'info',
    operationTypes: INSPECTION_OPS,
    note: 'проверяется по данным склада и журнала',
  },
  {
    id: 81,
    block: 8,
    title: 'Доверенность на представителя',
    mode: 'manual',
    operationTypes: INSPECTION_OPS,
    note: 'если не ГД',
  },
  {
    id: 82,
    block: 8,
    title: 'Заявление в Росалкогольтабакконтроль',
    mode: 'manual',
    operationTypes: INSPECTION_OPS,
  },
  {
    id: 83,
    block: 8,
    title: 'Платёжное поручение об оплате госпошлины',
    mode: 'manual',
    operationTypes: INSPECTION_OPS,
  },
  {
    id: 90,
    block: 9,
    title:
      'Проверять всю алкогольную продукцию (поступающую и на остатках) на предмет санкционных ограничений и статуса «выведена из оборота»',
    mode: 'info',
    note: 'уведомление для заказчика — такая продукция к обороту не допускается',
  },
  {
    id: 91,
    block: 9,
    title:
      'Товарные накладные и УПД оформляются и хранятся по правилам оборота алкоголя (ЕГАИС)',
    mode: 'info',
    note: 'информация для заказчика — первичные документы специалистом не проверяются',
  },
]

export function itemApplies(item: LicensingItemDef, operationType: OperationType): boolean {
  if (item.operationTypes && !item.operationTypes.includes(operationType)) return false
  return true
}

export function blockApplies(block: LicensingBlockDef, operationType: OperationType): boolean {
  if (block.operationTypes && !block.operationTypes.includes(operationType)) return false
  return true
}

export function isBlockDeferred(block: LicensingBlockDef, operationType: OperationType): boolean {
  return block.deferredForOperations?.includes(operationType) ?? false
}

export function getItemsForOperation(operationType: OperationType): LicensingItemDef[] {
  return LICENSING_ITEMS.filter((item) => itemApplies(item, operationType))
}

export function getCheckableItems(operationType: OperationType): LicensingItemDef[] {
  return getItemsForOperation(operationType).filter((item) => item.mode !== 'info')
}

export function licensingItemTitle(id: number): string {
  return LICENSING_ITEMS.find((i) => i.id === id)?.title ?? `Пункт ${id}`
}

export const LICENSING_ITEM_TITLES: Record<number, string> = Object.fromEntries(
  LICENSING_ITEMS.map((i) => [i.id, i.title]),
) as Record<number, string>

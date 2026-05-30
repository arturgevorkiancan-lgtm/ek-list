export type ComplianceCategory = '289н' | 'ГОСТ' | 'ЕГАИС'

export interface ComplianceRequirementDef {
  id: string
  text: string
  category: ComplianceCategory
  /** ГОСТ-пункты — только при наличии продукции на складе */
  requiresStock?: boolean
}

/** Требования 289н — полный набор на каждый склад; ГОСТ — при has_stock */
export const COMPLIANCE_REQUIREMENTS: ComplianceRequirementDef[] = [
  {
    id: 'thermometer',
    text: 'Термометр установлен и поверен (свидетельство о поверке актуально)',
    category: '289н',
  },
  {
    id: 'hygrometer',
    text: 'Гигрометр установлен и поверен (свидетельство о поверке актуально)',
    category: '289н',
  },
  {
    id: 'journal_kept',
    text: 'Журнал учёта условий хранения ведётся (записи не реже 1 раза в сутки)',
    category: '289н',
  },
  {
    id: 'pallets',
    text: 'Нижний ярус продукции на поддонах (высота ≥ 15 см от пола)',
    category: '289н',
  },
  {
    id: 'wall_distance',
    text: 'Расстояние от стен до продукции не менее 0,5 м',
    category: '289н',
  },
  {
    id: 'aisle_width',
    text: 'Ширина проходов между стеллажами не менее 0,5 м',
    category: '289н',
  },
  {
    id: 'no_sunlight',
    text: 'Прямой солнечный свет в зону хранения не попадает',
    category: '289н',
  },
  {
    id: 'ventilation_ok',
    text: 'Вентиляция функционирует (приточно-вытяжная)',
    category: '289н',
  },
  {
    id: 'isolation_from_office',
    text: 'Склад изолирован от служебных и подсобных помещений',
    category: '289н',
  },
  {
    id: 'lighting_ok',
    text: 'Искусственное освещение, приборы соответствуют требованиям',
    category: '289н',
  },
  {
    id: 'egais_connected',
    text: 'ЕГАИС подключён и работает на данном складе',
    category: 'ЕГАИС',
  },
  {
    id: 'temp_in_range',
    text: 'Текущая температура соответствует нормам хранения продукции',
    category: 'ГОСТ',
    requiresStock: true,
  },
  {
    id: 'humidity_in_range',
    text: 'Текущая влажность соответствует нормам хранения продукции',
    category: 'ГОСТ',
    requiresStock: true,
  },
  {
    id: 'no_foreign_smell',
    text: 'Посторонние запахи в помещении отсутствуют',
    category: 'ГОСТ',
    requiresStock: true,
  },
]

export function warehouseHasStock(productTypes: string[] | undefined | null): boolean {
  return (productTypes ?? []).includes('has_stock')
}

export function getApplicableComplianceItems(hasStock: boolean): ComplianceRequirementDef[] {
  return COMPLIANCE_REQUIREMENTS.filter((item) => !item.requiresStock || hasStock)
}

export function getComplianceTotal(hasStock: boolean): number {
  return getApplicableComplianceItems(hasStock).length
}

export const COMPLIANCE_ITEM_IDS = COMPLIANCE_REQUIREMENTS.map((i) => i.id)

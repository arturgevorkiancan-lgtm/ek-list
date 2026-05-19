import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  RefreshCw,
  Thermometer,
  Droplets,
} from 'lucide-react'
import { useToast } from '../context/ToastContext'
import type { WarehouseWithProducts } from '../lib/api'
import { computeSafeRange, type SafeRange } from '../lib/storageUtils'

export type ProductType =
  | 'wine'
  | 'sparkling'
  | 'collectible'
  | 'cognac'
  | 'vodka'
  | 'whisky'
  | 'beer'
  | 'cider'
  | 'ethanol'

export interface StorageNorms {
  label: string
  gost: string
  tempMin: number
  tempMax: number
  humidityMin: number
  humidityMax: number
  lightRestriction: string
  wallDistance: number
  shelfHeight: number | null
  ventilation: string
  notes: string
}

interface AiNormPayload {
  productKey: ProductType
  gost: string
  tempMin: number
  tempMax: number
  humidityMin: number
  humidityMax: number
  lightRestriction: string
  wallDistance: number
  ventilation: string
  notes: string
}

const PRODUCT_TYPES: ProductType[] = [
  'wine',
  'sparkling',
  'collectible',
  'cognac',
  'vodka',
  'whisky',
  'beer',
  'cider',
  'ethanol',
]

export const GOST_DATA: Record<ProductType, StorageNorms> = {
  wine: {
    label: 'Вино столовое',
    gost: 'ГОСТ 32030-2013, ГОСТ Р 51158-2009',
    tempMin: 5,
    tempMax: 20,
    humidityMin: 60,
    humidityMax: 80,
    lightRestriction: 'Прямой солнечный свет недопустим',
    wallDistance: 0.5,
    shelfHeight: null,
    ventilation: 'Естественная или принудительная, без посторонних запахов',
    notes: 'Бутылки хранить горизонтально (для пробковых). Вибрация недопустима.',
  },
  sparkling: {
    label: 'Вино игристое / шампанское',
    gost: 'ГОСТ 33336-2015',
    tempMin: 5,
    tempMax: 15,
    humidityMin: 70,
    humidityMax: 85,
    lightRestriction: 'Полная защита от света',
    wallDistance: 0.5,
    shelfHeight: null,
    ventilation: 'Принудительная, без посторонних запахов',
    notes: 'Горизонтальное хранение обязательно. Без резких перепадов температуры.',
  },
  collectible: {
    label: 'Коллекционное вино',
    gost: 'ГОСТ 32030-2013, ГОСТ Р 51158-2009',
    tempMin: 10,
    tempMax: 14,
    humidityMin: 65,
    humidityMax: 80,
    lightRestriction: 'Полная темнота',
    wallDistance: 0.5,
    shelfHeight: null,
    ventilation: 'Принудительная, строгий контроль',
    notes: 'Специальные стеллажи. Вибрация строго недопустима. Отдельное помещение.',
  },
  cognac: {
    label: 'Коньяк, бренди',
    gost: 'ГОСТ 31732-2014',
    tempMin: 5,
    tempMax: 25,
    humidityMin: 65,
    humidityMax: 80,
    lightRestriction: 'Прямой солнечный свет недопустим',
    wallDistance: 0.5,
    shelfHeight: 2.0,
    ventilation: 'Нормальная, без посторонних запахов',
    notes: 'Хранить вертикально в закрытой таре.',
  },
  vodka: {
    label: 'Водка, ликёры, настойки',
    gost: 'ГОСТ 12712-2013',
    tempMin: 10,
    tempMax: 25,
    humidityMin: 60,
    humidityMax: 80,
    lightRestriction: 'Прямой солнечный свет нежелателен',
    wallDistance: 0.5,
    shelfHeight: 2.0,
    ventilation: 'Нормальная',
    notes: 'Хранить вертикально. Нижний ряд на поддонах высотой не менее 15 см.',
  },
  whisky: {
    label: 'Виски, ром, джин',
    gost: 'ГОСТ 33813-2016',
    tempMin: 10,
    tempMax: 25,
    humidityMin: 60,
    humidityMax: 80,
    lightRestriction: 'Прямой солнечный свет недопустим',
    wallDistance: 0.5,
    shelfHeight: 2.0,
    ventilation: 'Нормальная, без посторонних запахов',
    notes: 'Хранить вертикально.',
  },
  beer: {
    label: 'Пиво, пивные напитки',
    gost: 'ГОСТ 31711-2012',
    tempMin: 2,
    tempMax: 12,
    humidityMin: 60,
    humidityMax: 75,
    lightRestriction: 'Полная защита от света (тёмное хранение)',
    wallDistance: 0.5,
    shelfHeight: null,
    ventilation: 'Принудительная, поддержание холода',
    notes: 'Требуется холодильное оборудование. Нижний ряд на поддонах.',
  },
  cider: {
    label: 'Сидр, медовуха',
    gost: 'ГОСТ 31820-2015',
    tempMin: 2,
    tempMax: 20,
    humidityMin: 60,
    humidityMax: 80,
    lightRestriction: 'Прямой солнечный свет недопустим',
    wallDistance: 0.5,
    shelfHeight: null,
    ventilation: 'Нормальная',
    notes: 'Хранить горизонтально или вертикально по типу укупорки.',
  },
  ethanol: {
    label: 'Этиловый спирт',
    gost: 'ГОСТ Р 51652-2000',
    tempMin: 10,
    tempMax: 25,
    humidityMin: 60,
    humidityMax: 75,
    lightRestriction: 'Защита от прямого света',
    wallDistance: 1.0,
    shelfHeight: null,
    ventilation: 'Принудительная усиленная, взрывозащищённое оборудование',
    notes:
      'Пожароопасно! Хранение в металлических шкафах/ёмкостях. Заземление обязательно. Отдельное помещение с вентиляцией по классу В-Iа.',
  },
}

const MINFIN_289N_ITEMS = [
  'Площадь склада: не менее 50 кв.м (для хранения алкоголя)',
  'Высота потолков: не менее 2,2 м',
  'Отопление: система отопления, обеспечивающая t° не ниже +10°C зимой',
  'Вентиляция: приточно-вытяжная',
  'Освещение: искусственное освещение, защита от прямого солнечного света',
  'Полы и стеллажи: стеллажи/поддоны, нижний ярус не ниже 15 см от пола; расстояние между стеллажами не менее 0,5 м',
  'Измерительное оборудование: гигрометр и термометр с фиксацией показаний (журнал или автоматическая система); гигрометры и термометры должны быть поверены',
  'Охрана: наличие охранной и пожарной сигнализации',
  'Документация: наличие технического паспорта помещения или технического плана',
]

function isProductType(value: string): value is ProductType {
  return (PRODUCT_TYPES as string[]).includes(value)
}

function parseStoredProductTypes(raw: string[] | undefined | null): ProductType[] {
  return (raw ?? []).filter(isProductType)
}

function categoryBorderClass(key: ProductType): string {
  if (key === 'ethanol') return 'border-l-red-500'
  if (key === 'beer' || key === 'cider') return 'border-l-blue-500'
  if (key === 'vodka' || key === 'cognac' || key === 'whisky') return 'border-l-amber-500'
  return 'border-l-purple-500'
}

function tempBadgeClass(tempMax: number): string {
  if (tempMax <= 10) return 'bg-blue-100 text-blue-800'
  if (tempMax <= 20) return 'bg-emerald-100 text-emerald-800'
  return 'bg-orange-100 text-orange-800'
}

function humidityBadgeClass(humidityMax: number): string {
  if (humidityMax < 60) return 'bg-orange-100 text-orange-800'
  if (humidityMax <= 80) return 'bg-emerald-100 text-emerald-800'
  return 'bg-blue-100 text-blue-800'
}

function CombinedStorageBanner({ range }: { range: SafeRange }) {
  if (!range.compatible) {
    return (
      <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
        ⚠️ Совместное хранение не рекомендуется — диапазоны условий несовместимы
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      ✅ Совместное хранение допустимо: {range.tempMin}–{range.tempMax}°C, влажность{' '}
      {range.humidityMin}–{range.humidityMax}%
    </div>
  )
}

function mergeAiNorm(base: StorageNorms, ai: AiNormPayload): StorageNorms {
  return {
    ...base,
    gost: ai.gost || base.gost,
    tempMin: ai.tempMin ?? base.tempMin,
    tempMax: ai.tempMax ?? base.tempMax,
    humidityMin: ai.humidityMin ?? base.humidityMin,
    humidityMax: ai.humidityMax ?? base.humidityMax,
    lightRestriction: ai.lightRestriction || base.lightRestriction,
    wallDistance: ai.wallDistance ?? base.wallDistance,
    ventilation: ai.ventilation || base.ventilation,
    notes: ai.notes || base.notes,
  }
}

function parseAiNormsArray(parsed: unknown): AiNormPayload[] {
  if (!Array.isArray(parsed)) throw new Error('Ожидался JSON-массив')
  return parsed.map((row) => {
    const item = row as Record<string, unknown>
    const key = String(item.productKey ?? '')
    if (!isProductType(key)) throw new Error(`Неизвестный productKey: ${key}`)
    return {
      productKey: key,
      gost: String(item.gost ?? ''),
      tempMin: Number(item.tempMin),
      tempMax: Number(item.tempMax),
      humidityMin: Number(item.humidityMin),
      humidityMax: Number(item.humidityMax),
      lightRestriction: String(item.lightRestriction ?? ''),
      wallDistance: Number(item.wallDistance),
      ventilation: String(item.ventilation ?? ''),
      notes: String(item.notes ?? ''),
    }
  })
}

async function fetchAiNorms(selectedProducts: ProductType[]): Promise<AiNormPayload[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!supabaseUrl?.trim() || !supabaseKey?.trim()) {
    throw new Error('Не заданы VITE_SUPABASE_URL или VITE_SUPABASE_ANON_KEY')
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/gost-refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      productLabels: selectedProducts.map((key) => GOST_DATA[key].label),
    }),
  })

  const data = (await response.json()) as { norms?: unknown; error?: string }
  if (data.error) throw new Error(data.error)
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`)
  }
  if (!data.norms) throw new Error('Пустой ответ API')
  return parseAiNormsArray(data.norms)
}

interface StorageStandardsCardProps {
  warehouse: WarehouseWithProducts
  onSaveProductTypes: (types: ProductType[]) => Promise<void>
}

function ProductNormCard({
  productKey,
  norms,
}: {
  productKey: ProductType
  norms: StorageNorms
}) {
  return (
    <div
      className={`rounded-lg border border-slate-200 border-l-4 bg-white p-4 space-y-2 ${categoryBorderClass(productKey)}`}
    >
      <p className="font-medium text-slate-900">{norms.label}</p>
      <p className="text-xs text-slate-500">{norms.gost}</p>
      <div className="flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tempBadgeClass(norms.tempMax)}`}
        >
          <Thermometer className="h-3.5 w-3.5" />
          {norms.tempMin}–{norms.tempMax}°C
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${humidityBadgeClass(norms.humidityMax)}`}
        >
          <Droplets className="h-3.5 w-3.5" />
          {norms.humidityMin}–{norms.humidityMax}%
        </span>
      </div>
      <dl className="grid gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Свет</dt>
          <dd>{norms.lightRestriction}</dd>
        </div>
        <div>
          <dt className="text-slate-500">От стен</dt>
          <dd>не менее {norms.wallDistance} м</dd>
        </div>
        {norms.shelfHeight != null && (
          <div>
            <dt className="text-slate-500">Высота стеллажей</dt>
            <dd>не более {norms.shelfHeight} м</dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="text-slate-500">Вентиляция</dt>
          <dd>{norms.ventilation}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-500">Примечания</dt>
          <dd>{norms.notes}</dd>
        </div>
      </dl>
    </div>
  )
}

export function StorageStandardsCard({
  warehouse,
  onSaveProductTypes,
}: StorageStandardsCardProps) {
  const { showToast } = useToast()
  const [selectedProducts, setSelectedProducts] = useState<ProductType[]>(() =>
    parseStoredProductTypes(warehouse.product_types),
  )
  const [aiOverrides, setAiOverrides] = useState<Partial<Record<ProductType, StorageNorms>>>({})
  const [aiUpdatedAt, setAiUpdatedAt] = useState<Date | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [savingTypes, setSavingTypes] = useState(false)
  const [minfinOpen, setMinfinOpen] = useState(true)

  useEffect(() => {
    setSelectedProducts(parseStoredProductTypes(warehouse.product_types))
  }, [warehouse.id, warehouse.product_types])

  useEffect(() => {
    setAiOverrides({})
    setAiUpdatedAt(null)
  }, [warehouse.id])

  const displayNorms = useCallback(
    (key: ProductType): StorageNorms => aiOverrides[key] ?? GOST_DATA[key],
    [aiOverrides],
  )

  const combinedRange = useMemo(() => {
    if (selectedProducts.length < 2) return null
    return computeSafeRange(selectedProducts)
  }, [selectedProducts])

  const toggleProduct = async (key: ProductType) => {
    const prev = selectedProducts
    const next = prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    setSelectedProducts(next)
    setSavingTypes(true)
    try {
      await onSaveProductTypes(next)
    } catch {
      setSelectedProducts(prev)
      showToast('Не удалось сохранить виды продукции', 'error')
    } finally {
      setSavingTypes(false)
    }
  }

  const handleAiRefresh = async () => {
    if (selectedProducts.length === 0) {
      showToast('Выберите хотя бы один вид продукции', 'error')
      return
    }
    setAiLoading(true)
    try {
      const rows = await fetchAiNorms(selectedProducts)
      const next: Partial<Record<ProductType, StorageNorms>> = {}
      for (const row of rows) {
        if (!selectedProducts.includes(row.productKey)) continue
        next[row.productKey] = mergeAiNorm(GOST_DATA[row.productKey], row)
      }
      setAiOverrides(next)
      setAiUpdatedAt(new Date())
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Не удалось обновить данные через ИИ',
        'error',
      )
    } finally {
      setAiLoading(false)
    }
  }

  const chipClass = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
      active
        ? 'border-brand-600 bg-brand-600 text-white'
        : 'border-slate-300 bg-white text-slate-700 hover:border-brand-300'
    } ${savingTypes ? 'opacity-60 pointer-events-none' : ''}`

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Требования к хранению</h3>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {aiUpdatedAt && (
            <span className="text-xs text-slate-500">
              Обновлено: {format(aiUpdatedAt, 'dd.MM.yyyy HH:mm', { locale: ru })}
            </span>
          )}
          <button
            type="button"
            disabled={aiLoading || selectedProducts.length === 0}
            onClick={() => void handleAiRefresh()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
          >
            {aiLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Обновить через ИИ
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-2">Виды продукции на складе</p>
        <div className="flex flex-wrap gap-2 max-w-full">
          {PRODUCT_TYPES.map((key) => (
            <button
              key={key}
              type="button"
              className={chipClass(selectedProducts.includes(key))}
              onClick={() => void toggleProduct(key)}
            >
              {GOST_DATA[key].label}
            </button>
          ))}
        </div>
      </div>

      {selectedProducts.length > 0 ? (
        <div className="space-y-3">
          {combinedRange && <CombinedStorageBanner range={combinedRange} />}
          <div className="grid gap-3 sm:grid-cols-2">
            {selectedProducts.map((key) => (
              <ProductNormCard key={key} productKey={key} norms={displayNorms(key)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Thermometer className="h-10 w-10 text-slate-300 mb-3" aria-hidden />
          <p className="text-sm text-slate-500">Выберите виды продукции выше</p>
          <p className="text-sm text-slate-500">чтобы увидеть требования по ГОСТ</p>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50/80 overflow-hidden">
        <button
          type="button"
          onClick={() => setMinfinOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-100/80"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Info className="h-4 w-4 text-brand-600 shrink-0" />
            <span className="truncate">
              Приказ Минфина России № 289н от 27.11.2020 (ред. от 2023)
            </span>
          </span>
          {minfinOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
          )}
        </button>
        {minfinOpen && (
          <ul className="border-t border-slate-200 px-4 py-3 space-y-1.5 text-xs text-slate-600 list-disc list-inside">
            {MINFIN_289N_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

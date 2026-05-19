import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { OperationType, ProductTypeFlag } from '../types'
import { OPERATION_LABELS } from '../data/checklistItems'

const OPERATIONS: OperationType[] = [
  'ПОЛУЧЕНИЕ',
  'ПЕРЕОФОРМЛЕНИЕ',
  'ПРОДЛЕНИЕ',
  'ПРОВЕРКА_ВЫЕЗДНАЯ',
  'ПРОВЕРКА_ВНЕПЛАНОВАЯ',
]

const PRODUCT_FLAGS: { value: ProductTypeFlag; label: string }[] = [
  { value: 'customs_warehouse', label: 'Таможенный склад' },
  { value: 'has_stock', label: 'Есть остатки продукции' },
  { value: 'retail', label: 'Розница' },
  { value: 'wholesale', label: 'Опт' },
]

interface NewChecklistModalProps {
  open: boolean
  onClose: () => void
  onCreate: (operationType: OperationType, productTypes: ProductTypeFlag[]) => void
  initialOperationType?: OperationType
}

export function NewChecklistModal({
  open,
  onClose,
  onCreate,
  initialOperationType,
}: NewChecklistModalProps) {
  const [operationType, setOperationType] = useState<OperationType>(
    initialOperationType ?? 'ПОЛУЧЕНИЕ',
  )
  const [productTypes, setProductTypes] = useState<ProductTypeFlag[]>([])

  useEffect(() => {
    if (open && initialOperationType) {
      setOperationType(initialOperationType)
    }
  }, [open, initialOperationType])

  if (!open) return null

  const toggleProduct = (flag: ProductTypeFlag) => {
    setProductTypes((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag],
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">Новый чеклист</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Тип операции</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={operationType}
              onChange={(e) => setOperationType(e.target.value as OperationType)}
            >
              {OPERATIONS.map((op) => (
                <option key={op} value={op}>
                  {OPERATION_LABELS[op]}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Виды продукции / условия</legend>
            <div className="mt-2 space-y-2">
              {PRODUCT_FLAGS.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={productTypes.includes(value)}
                    onChange={() => toggleProduct(value)}
                    className="rounded border-slate-300"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => onCreate(operationType, productTypes)}
              className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Создать
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import type { Warehouse } from '../types'
import type { ParsedWarehouseDocumentFields } from '../lib/parseWarehouseDocument'

type FieldKey = 'address' | 'area' | 'cadastral_number' | 'purpose' | 'floor'

const FIELD_KEYS: FieldKey[] = [
  'address',
  'area',
  'cadastral_number',
  'purpose',
  'floor',
]

const FIELD_LABELS: Record<FieldKey, string> = {
  address: 'Адрес',
  area: 'Площадь',
  cadastral_number: 'Кадастр',
  purpose: 'Назначение',
  floor: 'Этаж',
}

function formatCurrentValue(key: FieldKey, warehouse: Warehouse): string {
  switch (key) {
    case 'address':
      return warehouse.address?.trim() || '—'
    case 'area':
      return warehouse.area_sqm != null ? `${warehouse.area_sqm} кв.м` : '—'
    case 'cadastral_number':
      return warehouse.cadastral_number?.trim() || '—'
    case 'purpose':
      return warehouse.object_purpose?.trim() || '—'
    case 'floor':
      return warehouse.floor?.trim() || '—'
  }
}

function formatDocValue(key: FieldKey, parsed: ParsedWarehouseDocumentFields): string {
  switch (key) {
    case 'address':
      return parsed.address?.trim() || '—'
    case 'area': {
      if (parsed.area == null || parsed.area === '') return '—'
      const raw = String(parsed.area).replace('.', ',')
      return `${raw} кв.м`
    }
    case 'cadastral_number':
      return parsed.cadastral_number?.trim() || '—'
    case 'purpose':
      return parsed.purpose?.trim() || '—'
    case 'floor':
      return parsed.floor?.trim() || '—'
  }
}

function hasDocValue(key: FieldKey, parsed: ParsedWarehouseDocumentFields): boolean {
  return formatDocValue(key, parsed) !== '—'
}

function displayWarehouseTitle(name: string): string {
  return name.replace(/^склад\s+/i, '')
}

interface WarehouseDataUpdateModalProps {
  warehouse: Warehouse
  parsed: ParsedWarehouseDocumentFields
  saving: boolean
  onCancel: () => void
  onApply: (fields: Partial<Warehouse>) => void
}

export function WarehouseDataUpdateModal({
  warehouse,
  parsed,
  saving,
  onCancel,
  onApply,
}: WarehouseDataUpdateModalProps) {
  const availableKeys = useMemo(
    () => FIELD_KEYS.filter((k) => hasDocValue(k, parsed)),
    [parsed],
  )

  const [selected, setSelected] = useState<Record<FieldKey, boolean>>(() => {
    const init: Record<FieldKey, boolean> = {
      address: false,
      area: false,
      cadastral_number: false,
      purpose: false,
      floor: false,
    }
    for (const key of availableKeys) init[key] = true
    return init
  })

  const allSelected =
    availableKeys.length > 0 && availableKeys.every((k) => selected[k])

  useEffect(() => {
    const onEsc = () => onCancel()
    window.addEventListener('checklist:escape', onEsc)
    return () => window.removeEventListener('checklist:escape', onEsc)
  }, [onCancel])

  const toggleAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev }
      for (const key of availableKeys) next[key] = checked
      return next
    })
  }

  const handleApply = () => {
    const patch: Partial<Warehouse> = {}
    if (selected.address && parsed.address) patch.address = parsed.address.trim()
    if (selected.area && parsed.area != null && parsed.area !== '') {
      const n = Number(String(parsed.area).replace(',', '.'))
      if (Number.isFinite(n)) patch.area_sqm = n
    }
    if (selected.cadastral_number && parsed.cadastral_number) {
      patch.cadastral_number = parsed.cadastral_number.trim()
    }
    if (selected.purpose && parsed.purpose) {
      patch.object_purpose = parsed.purpose.trim()
    }
    if (selected.floor && parsed.floor) patch.floor = parsed.floor.trim()
    onApply(patch)
  }

  const canApply = availableKeys.some((k) => selected[k])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900 text-sm sm:text-base">
            Обновить данные склада «{displayWarehouseTitle(warehouse.name)}»
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-slate-100 shrink-0"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-2 font-medium text-left w-28">Поле</th>
                <th className="pb-2 pr-2 font-medium text-left">Сейчас</th>
                <th className="pb-2 font-medium text-left">Из документа</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_KEYS.map((key) => (
                <tr key={key} className="border-b border-slate-100 text-slate-800">
                  <td className="py-2 pr-2 align-top">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        disabled={!hasDocValue(key, parsed)}
                        checked={selected[key]}
                        onChange={(e) =>
                          setSelected((s) => ({ ...s, [key]: e.target.checked }))
                        }
                      />
                      <span>{FIELD_LABELS[key]}</span>
                    </label>
                  </td>
                  <td className="py-2 pr-2 align-top text-slate-600 max-w-[140px] break-words">
                    {formatCurrentValue(key, warehouse)}
                  </td>
                  <td className="py-2 align-top max-w-[180px] break-words">
                    {formatDocValue(key, parsed)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => toggleAll(e.target.checked)}
            disabled={availableKeys.length === 0}
          />
          Обновить все поля
        </label>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm min-h-[44px]"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={saving || !canApply}
            onClick={handleApply}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50 min-h-[44px] inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Применить изменения
          </button>
        </div>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { createWarehousesFromRegistry } from '../lib/api'
import { generateWarehouseName } from '../lib/generateWarehouseName'
import { loadFromCache, type LicenseRecord } from '../lib/licenseRegistry'
import { isWarehouseAddressDuplicate } from '../lib/warehouseAddressMatch'
import { useToast } from '../context/ToastContext'
import type { Warehouse } from '../types'

type RegistryAddressRow = {
  id: string
  address: string
  kpp: string | null
  licenseNumber: string
  isDuplicate: boolean
}

function collectRegistryAddresses(licenses: LicenseRecord[]): Omit<RegistryAddressRow, 'isDuplicate'>[] {
  const seen = new Set<string>()
  const rows: Omit<RegistryAddressRow, 'isDuplicate'>[] = []

  for (const lic of licenses) {
    for (const [index, raw] of lic.addresses.entries()) {
      const address = raw.trim()
      if (!address) continue
      const key = address.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        id: `${lic.license_number || 'lic'}-${index}-${key.slice(0, 24)}`,
        address,
        kpp: lic.kpp,
        licenseNumber: lic.license_number,
      })
    }
  }
  return rows
}

interface RegistryWarehousesPanelProps {
  clientId: string
  clientInn: string | null | undefined
  warehouses: Warehouse[]
  onWarehousesCreated: () => void
}

export function RegistryWarehousesPanel({
  clientId,
  clientInn,
  warehouses,
  onWarehousesCreated,
}: RegistryWarehousesPanelProps) {
  const { showToast } = useToast()
  const inn = clientInn?.trim() ?? ''
  const hasInn = inn.length > 0

  const [expanded, setExpanded] = useState(true)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeLicenses, setActiveLicenses] = useState<LicenseRecord[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const loadRegistry = useCallback(async () => {
    if (!hasInn) return
    setLoading(true)
    setError(null)
    try {
      const data = await loadFromCache(inn)
      setActiveLicenses(data.active)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки реестра')
      setActiveLicenses([])
    } finally {
      setLoading(false)
    }
  }, [hasInn, inn])

  useEffect(() => {
    if (!hasInn) {
      setActiveLicenses([])
      return
    }
    void loadRegistry()
  }, [hasInn, loadRegistry])

  const rows = useMemo((): RegistryAddressRow[] => {
    const base = collectRegistryAddresses(activeLicenses)
    return base.map((row) => ({
      ...row,
      isDuplicate: warehouses.some((w) =>
        isWarehouseAddressDuplicate(row.address, w.address),
      ),
    }))
  }, [activeLicenses, warehouses])

  useEffect(() => {
    setSelected(new Set(rows.filter((r) => !r.isDuplicate).map((r) => r.id)))
  }, [rows])

  const allAddresses = rows.map((r) => r.address)
  const selectedCount = rows.filter((r) => selected.has(r.id)).length

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreate = async () => {
    const toCreate = rows.filter((r) => selected.has(r.id))
    if (!toCreate.length) return

    setCreating(true)
    try {
      const payload = toCreate.map((row) => ({
        client_id: clientId,
        name: generateWarehouseName(row.address, allAddresses),
        address: row.address,
        kpp: row.kpp,
      }))
      const count = await createWarehousesFromRegistry(payload)
      showToast(`Создано складов: ${count}`)
      onWarehousesCreated()
      void loadRegistry()
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Не удалось создать склады',
        'error',
      )
    } finally {
      setCreating(false)
    }
  }

  if (!hasInn) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 p-4 text-left border-b border-slate-100"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
        )}
        <Building2 className="h-5 w-5 text-brand-600 shrink-0" />
        <h2 className="font-semibold text-slate-900">Склады из реестра</h2>
        {rows.length > 0 && (
          <span className="text-xs text-slate-500 font-normal ml-auto">
            {rows.length} адресов
          </span>
        )}
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          {loading && (
            <p className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
              Загружаем адреса из реестра…
            </p>
          )}

          {error && (
            <p className="text-sm text-red-700 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              {error}
            </p>
          )}

          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-slate-600">
              В действующих лицензиях реестра нет адресов для создания складов
            </p>
          )}

          {!loading && rows.length > 0 && (
            <div className="space-y-2">
              {rows.map((row) => (
                <label
                  key={row.id}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm cursor-pointer ${
                    row.isDuplicate
                      ? 'border-slate-200 bg-slate-50 text-slate-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-slate-900 break-words">{row.address}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {row.kpp ? `КПП ${row.kpp}` : 'КПП —'}
                      {row.licenseNumber ? ` · лиц. ${row.licenseNumber}` : ''}
                      {row.isDuplicate && (
                        <span className="ml-2 text-amber-700 font-medium">уже существует</span>
                      )}
                    </span>
                  </span>
                </label>
              ))}

              <button
                type="button"
                disabled={creating || selectedCount === 0}
                onClick={() => void handleCreate()}
                className="w-full sm:w-auto rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50 min-h-[44px] inline-flex items-center justify-center gap-2"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Создать выбранные{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

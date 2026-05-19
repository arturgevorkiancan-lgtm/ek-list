import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, subDays } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import {
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Trash2,
} from 'lucide-react'
import {
  addStorageReading,
  deleteStorageReading,
  fetchStorageReadings,
  syncOfflineReadings,
  type StorageReading,
} from '../lib/api'
import { rangeValueClass } from '../lib/checklistStatusStyles'
import { GOST_DATA, type ProductType } from './StorageStandardsCard'
import { useToast } from '../context/ToastContext'
import type { SafeRange } from '../lib/storageUtils'

export interface CombinedStorageRange {
  tempMin: number
  tempMax: number
  humidityMin: number
  humidityMax: number
}

export function getCombinedStorageRange(
  productTypes: ProductType[],
): CombinedStorageRange | null {
  if (productTypes.length === 0) return null
  const norms = productTypes.map((key) => GOST_DATA[key])
  const tempMin = Math.max(...norms.map((n) => n.tempMin))
  const tempMax = Math.min(...norms.map((n) => n.tempMax))
  const humidityMin = Math.max(...norms.map((n) => n.humidityMin))
  const humidityMax = Math.min(...norms.map((n) => n.humidityMax))
  if (tempMin > tempMax || humidityMin > humidityMax) return null
  return { tempMin, tempMax, humidityMin, humidityMax }
}

export type ValueRangeStatus = 'ok' | 'warn' | 'bad' | 'neutral'

export function getValueRangeStatus(
  value: number,
  min: number,
  max: number,
  margin = 2,
): ValueRangeStatus {
  if (value >= min && value <= max) return 'ok'
  if (value >= min - margin && value <= max + margin) return 'warn'
  return 'bad'
}

function statusCellClass(status: ValueRangeStatus): string {
  if (status === 'ok') return 'bg-green-50 text-green-800'
  if (status === 'warn' || status === 'bad') return 'bg-red-50 text-red-800'
  return ''
}

function inputRangeClass(status: ValueRangeStatus): string {
  const base = 'mt-1 w-full rounded-md border px-2 py-1.5 text-sm'
  if (status === 'neutral') return `${base} border-slate-300`
  return `${base} ${rangeValueClass(status === 'ok')}`
}

function getTempColor(val: number, range: SafeRange | null): string {
  if (!range?.compatible) return '#111'
  if (val < range.tempMin || val > range.tempMax) return '#dc2626'
  if (val < range.tempMin + 2 || val > range.tempMax - 2) return '#d97706'
  return '#15803d'
}

function getHumidityColor(val: number, range: SafeRange | null): string {
  if (!range?.compatible) return '#111'
  if (val < range.humidityMin || val > range.humidityMax) return '#dc2626'
  if (val < range.humidityMin + 2 || val > range.humidityMax - 2) return '#d97706'
  return '#15803d'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(iso: string): string {
  return format(parseISO(iso), 'dd.MM.yyyy', { locale: ru })
}

function formatTime(iso: string): string {
  return format(parseISO(iso), 'HH:mm', { locale: ru })
}

function toDatetimeLocalValue(iso: string): string {
  const d = parseISO(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString()
}

function isProductType(value: string): value is ProductType {
  return value in GOST_DATA
}

export function parseProductTypes(raw: string[] | undefined | null): ProductType[] {
  return (raw ?? []).filter(isProductType)
}

interface StorageJournalProps {
  warehouseId: string
  clientId: string
  warehouseName: string
  safeRange: SafeRange | null
}

function StorageReadingsChart({
  readings,
  safeRange,
}: {
  readings: StorageReading[]
  safeRange: SafeRange | null
}) {
  const readings14days = useMemo(() => {
    const cutoff = subDays(new Date(), 14)
    return readings
      .filter((r) => parseISO(r.recorded_at) >= cutoff)
      .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  }, [readings])

  const chartData = useMemo(
    () =>
      readings14days.map((r) => ({
        date: format(parseISO(r.recorded_at), 'dd.MM', { locale: ru }),
        temp: r.temperature,
        humidity: r.humidity,
      })),
    [readings14days],
  )

  if (chartData.length < 3) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium text-slate-600 mb-2">Динамика за 14 дней</p>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis
            yAxisId="temp"
            orientation="left"
            domain={['auto', 'auto']}
            tick={{ fontSize: 11 }}
            label={{
              value: '°C',
              angle: -90,
              position: 'insideLeft',
              offset: 10,
              style: { fontSize: 11 },
            }}
          />
          <YAxis
            yAxisId="humidity"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
            label={{
              value: '%',
              angle: 90,
              position: 'insideRight',
              offset: 10,
              style: { fontSize: 11 },
            }}
          />
          <Tooltip
            formatter={(value: number, name: string) =>
              name === 'temp' ? [`${value}°C`, 'Температура'] : [`${value}%`, 'Влажность']
            }
          />
          <Legend
            formatter={(value) => (value === 'temp' ? 'Температура' : 'Влажность')}
          />
          {safeRange && (
            <>
              <ReferenceLine
                yAxisId="temp"
                y={safeRange.tempMin}
                stroke="#3b82f6"
                strokeDasharray="4 2"
                label={{
                  value: `${safeRange.tempMin}°C min`,
                  fontSize: 10,
                  fill: '#3b82f6',
                }}
              />
              <ReferenceLine
                yAxisId="temp"
                y={safeRange.tempMax}
                stroke="#3b82f6"
                strokeDasharray="4 2"
                label={{
                  value: `${safeRange.tempMax}°C max`,
                  fontSize: 10,
                  fill: '#3b82f6',
                }}
              />
              <ReferenceLine
                yAxisId="humidity"
                y={safeRange.humidityMin}
                stroke="#10b981"
                strokeDasharray="4 2"
                label={{
                  value: `${safeRange.humidityMin}% min`,
                  fontSize: 10,
                  fill: '#10b981',
                }}
              />
              <ReferenceLine
                yAxisId="humidity"
                y={safeRange.humidityMax}
                stroke="#10b981"
                strokeDasharray="4 2"
                label={{
                  value: `${safeRange.humidityMax}% max`,
                  fontSize: 10,
                  fill: '#10b981',
                }}
              />
            </>
          )}
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="temp"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            yAxisId="humidity"
            type="monotone"
            dataKey="humidity"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function StorageJournal({
  warehouseId,
  clientId,
  warehouseName,
  safeRange,
}: StorageJournalProps) {
  const { showToast } = useToast()
  const qc = useQueryClient()
  const [open, setOpen] = useState(true)
  const [recordedAt, setRecordedAt] = useState(() => toDatetimeLocalValue(new Date().toISOString()))
  const [temperature, setTemperature] = useState('')
  const [humidity, setHumidity] = useState('')
  const [recordedBy, setRecordedBy] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [hasUnsynced, setHasUnsynced] = useState(false)

  const range =
    safeRange?.compatible === true
      ? {
          tempMin: safeRange.tempMin,
          tempMax: safeRange.tempMax,
          humidityMin: safeRange.humidityMin,
          humidityMax: safeRange.humidityMax,
        }
      : null

  const { data: readings = [], isLoading } = useQuery({
    queryKey: ['storage-readings', warehouseId],
    queryFn: () => fetchStorageReadings(warehouseId),
  })

  const refreshSyncStatus = useCallback(() => {
    try {
      const raw = localStorage.getItem(`storage_readings_${warehouseId}`)
      const cached: StorageReading[] = raw ? JSON.parse(raw) : []
      setHasUnsynced(cached.some((r) => r.synced === false))
    } catch {
      setHasUnsynced(false)
    }
  }, [warehouseId])

  useEffect(() => {
    refreshSyncStatus()
  }, [refreshSyncStatus, readings])

  const runSync = useCallback(async () => {
    setSyncing(true)
    try {
      await syncOfflineReadings(warehouseId)
      await qc.invalidateQueries({ queryKey: ['storage-readings', warehouseId] })
      refreshSyncStatus()
    } finally {
      setSyncing(false)
    }
  }, [warehouseId, qc, refreshSyncStatus])

  useEffect(() => {
    void runSync()
  }, [warehouseId]) // eslint-disable-line react-hooks/exhaustive-deps -- sync on mount per warehouse

  const tableRows = useMemo(() => readings.slice(0, 30), [readings])

  const getTempStatus = useCallback(
    (value: number): ValueRangeStatus => {
      if (!range) return 'neutral'
      return getValueRangeStatus(value, range.tempMin, range.tempMax, 2)
    },
    [range],
  )

  const getHumidStatus = useCallback(
    (value: number): ValueRangeStatus => {
      if (!range) return 'neutral'
      return getValueRangeStatus(value, range.humidityMin, range.humidityMax, 2)
    },
    [range],
  )

  const draftTempStatus = useMemo((): ValueRangeStatus => {
    if (!temperature.trim() || !range) return 'neutral'
    const value = Number(temperature)
    if (Number.isNaN(value)) return 'neutral'
    return getTempStatus(value)
  }, [temperature, range, getTempStatus])

  const draftHumidStatus = useMemo((): ValueRangeStatus => {
    if (!humidity.trim() || !range) return 'neutral'
    const value = Number(humidity)
    if (Number.isNaN(value)) return 'neutral'
    return getHumidStatus(value)
  }, [humidity, range, getHumidStatus])

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    const temp = Number(temperature)
    const humid = Number(humidity)
    if (Number.isNaN(temp) || Number.isNaN(humid)) {
      showToast('Укажите температуру и влажность', 'error')
      return
    }
    setSubmitting(true)
    try {
      await addStorageReading({
        warehouse_id: warehouseId,
        client_id: clientId,
        recorded_at: fromDatetimeLocalValue(recordedAt),
        temperature: temp,
        humidity: humid,
        recorded_by: recordedBy.trim() || null,
        notes: notes.trim() || null,
      })
      setTemperature('')
      setHumidity('')
      setRecordedBy('')
      setNotes('')
      setRecordedAt(toDatetimeLocalValue(new Date().toISOString()))
      void qc.invalidateQueries({ queryKey: ['storage-readings', warehouseId] })
      refreshSyncStatus()
      showToast('Запись добавлена')
    } catch {
      showToast('Не удалось сохранить запись', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleExportCsv = () => {
    const header = ['Дата', 'Время', 'Температура (°C)', 'Влажность (%)', 'Кто замерял', 'Примечания']
    const rows = readings.map((r) => {
      const dt = parseISO(r.recorded_at)
      return [
        format(dt, 'dd.MM.yyyy', { locale: ru }),
        format(dt, 'HH:mm', { locale: ru }),
        String(r.temperature),
        String(r.humidity),
        r.recorded_by ?? '',
        r.notes ?? '',
      ]
    })
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = warehouseName.replace(/[/\\?%*:|"<>]/g, '_')
    link.href = url
    link.download = `Журнал_хранения_${safeName}_${format(new Date(), 'yyyy-MM')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportPDF = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const rows = readings
      .map(
        (r) => `
    <tr>
      <td>${formatDate(r.recorded_at)}</td>
      <td>${formatTime(r.recorded_at)}</td>
      <td style="color:${getTempColor(r.temperature, safeRange)}">${r.temperature}°C</td>
      <td style="color:${getHumidityColor(r.humidity, safeRange)}">${r.humidity}%</td>
      <td>${escapeHtml(r.recorded_by ?? '—')}</td>
      <td>${escapeHtml(r.notes ?? '—')}</td>
    </tr>
  `,
      )
      .join('')

    const safeRangeText = safeRange?.compatible
      ? `Допустимые условия: температура ${safeRange.tempMin}–${safeRange.tempMax}°C, влажность ${safeRange.humidityMin}–${safeRange.humidityMax}%`
      : 'Диапазоны условий несовместимы для совместного хранения'

    const now = new Date()
    const printedAt = `${now.toLocaleDateString('ru-RU')} ${now.toLocaleTimeString('ru-RU')}`

    printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Журнал хранения — ${escapeHtml(warehouseName)}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #111; }
        h2 { font-size: 16px; margin-bottom: 4px; }
        .meta { color: #555; margin-bottom: 16px; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; text-align: left; padding: 6px 8px; border: 1px solid #d1d5db; font-size: 11px; }
        td { padding: 5px 8px; border: 1px solid #e5e7eb; font-size: 11px; }
        tr:nth-child(even) td { background: #f9fafb; }
        .footer { margin-top: 24px; font-size: 10px; color: #9ca3af; }
        .safe-range { background: #f0fdf4; border: 1px solid #86efac; padding: 8px 12px; border-radius: 6px; margin-bottom: 14px; font-size: 11px; }
      </style>
    </head>
    <body>
      <h2>Журнал условий хранения — ${escapeHtml(warehouseName)}</h2>
      <div class="meta">Сформирован: ${printedAt}</div>
      <div class="safe-range">${safeRangeText}</div>
      <table>
        <thead>
          <tr>
            <th>Дата</th><th>Время</th><th>Температура</th><th>Влажность</th><th>Кто замерял</th><th>Примечания</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">ЧЕК-Лист · Всего записей: ${readings.length}</div>
    </body>
    </html>
  `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 300)
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteStorageReading(id)
      setConfirmDeleteId(null)
      void qc.invalidateQueries({ queryKey: ['storage-readings', warehouseId] })
      showToast('Запись удалена')
    } catch {
      showToast('Не удалось удалить запись', 'error')
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 overflow-hidden">
      <div className="flex w-full items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center justify-between gap-2 text-left text-sm font-medium text-slate-800 hover:text-brand-700 min-h-[44px]"
        >
          <span>📋 Журнал условий хранения</span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
          )}
        </button>
        <button
          type="button"
          onClick={() => void runSync()}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 shrink-0 text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50"
          title={hasUnsynced ? 'Синхронизировать несохранённые записи' : 'Данные синхронизированы'}
        >
          <span
            className={`h-2 w-2 rounded-full ${hasUnsynced ? 'bg-orange-500' : 'bg-emerald-500'}`}
          />
          {syncing
            ? 'Синхронизация…'
            : hasUnsynced
              ? 'Есть несинхронизированные записи'
              : 'Синхронизировано'}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-200 px-4 py-4 space-y-4 bg-white">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <p className="text-xs font-medium text-slate-700">Новая запись</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="block text-xs text-slate-600 sm:col-span-2 lg:col-span-1">
                Дата и время
                <input
                  type="datetime-local"
                  step={60}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  value={recordedAt}
                  onChange={(e) => setRecordedAt(e.target.value)}
                />
              </label>
              <label className="block text-xs text-slate-600">
                Температура (°C)
                <input
                  type="number"
                  step={0.1}
                  className={inputRangeClass(draftTempStatus)}
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  placeholder="18.5"
                  required
                />
              </label>
              <label className="block text-xs text-slate-600">
                Влажность (%)
                <input
                  type="number"
                  step={1}
                  className={inputRangeClass(draftHumidStatus)}
                  value={humidity}
                  onChange={(e) => setHumidity(e.target.value)}
                  placeholder="70"
                  required
                />
              </label>
              <label className="block text-xs text-slate-600">
                Кто замерял
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  value={recordedBy}
                  onChange={(e) => setRecordedBy(e.target.value)}
                />
              </label>
              <label className="block text-xs text-slate-600 sm:col-span-2 lg:col-span-1">
                Примечания
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 min-h-[44px] rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Добавить запись
            </button>
          </form>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-medium text-slate-700">Последние записи</p>
              {readings.length > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={exportPDF}
                    className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                  >
                    📄 Скачать PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Скачать журнал (CSV)
                  </button>
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="space-y-2 animate-pulse py-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-slate-200" />
                ))}
              </div>
            ) : tableRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 py-12 px-6 text-center">
                <p className="text-4xl mb-4" aria-hidden>
                  🌡
                </p>
                <h3 className="text-base font-semibold text-slate-900">Нет записей</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Добавьте первое измерение температуры и влажности
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-left">
                      <th className="px-3 py-2 font-medium">Дата/время</th>
                      <th className="px-3 py-2 font-medium">Темп.</th>
                      <th className="px-3 py-2 font-medium">Влажность</th>
                      <th className="px-3 py-2 font-medium">Кто замерял</th>
                      <th className="px-3 py-2 font-medium">Примечания</th>
                      <th className="px-3 py-2 font-medium w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableRows.map((r) => {
                      const tempStatus = getTempStatus(r.temperature)
                      const humidStatus = getHumidStatus(r.humidity)
                      return (
                        <tr key={r.id} className="text-slate-700">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {format(parseISO(r.recorded_at), 'dd.MM.yyyy HH:mm', { locale: ru })}
                          </td>
                          <td
                            className={`px-3 py-2 font-medium ${statusCellClass(tempStatus)}`}
                          >
                            {r.temperature}°C
                          </td>
                          <td
                            className={`px-3 py-2 font-medium ${statusCellClass(humidStatus)}`}
                          >
                            {r.humidity}%
                          </td>
                          <td className="px-3 py-2">{r.recorded_by || '—'}</td>
                          <td className="px-3 py-2 max-w-[160px] truncate">{r.notes || '—'}</td>
                          <td className="px-3 py-2">
                            {confirmDeleteId === r.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(r.id)}
                                  className="text-xs font-medium text-red-600 hover:text-red-700"
                                >
                                  Удалить?
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-slate-400 hover:text-slate-600 text-sm leading-none px-0.5"
                                  aria-label="Отмена"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(r.id)}
                                className="text-slate-400 hover:text-red-600"
                                title="Удалить"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <StorageReadingsChart readings={readings} safeRange={safeRange} />
        </div>
      )}
    </div>
  )
}

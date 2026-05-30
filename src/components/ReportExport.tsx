import { useEffect, useMemo, useState } from 'react'
import { differenceInDays, format, isValid, parseISO, subDays } from 'date-fns'
import { ru } from 'date-fns/locale'
import { X } from 'lucide-react'
import { parseProductTypes } from './StorageJournal'
import { GOST_DATA, type ProductType } from './StorageStandardsCard'
import { computeSafeRange } from '../lib/storageUtils'
import {
  getCheckableItems,
  getItemsForOperation,
  LICENSING_BLOCKS,
} from '../data/licensingChecklistTemplate'
import {
  getApplicableComplianceItems,
  warehouseHasStock,
} from '../data/warehouseComplianceTemplate'
import { warehouseDisplayTitle } from '../lib/generateWarehouseName'
import type { Client, License, OperationType, Warehouse } from '../types'

export interface ReportExportProps {
  client: Client
  license: License | null
  warehouses: Warehouse[]
}

type WarehouseRow = Warehouse & { product_types?: string[] }

type JournalRange = 7 | 30 | 90 | 'all'

type ReportSections = {
  clientInfo: boolean
  licenseStatus: boolean
  licensingChecklist: boolean
  storageGost: boolean
  storageJournal: boolean
  storageCompliance: boolean
}

type ItemStatus = 'pending' | 'done' | 'na'


function blockApplies(block: { operationTypes?: OperationType[] }, op: OperationType): boolean {
  if (!block.operationTypes) return true
  return block.operationTypes.includes(op)
}

const DEFAULT_SECTIONS: ReportSections = {
  clientInfo: true,
  licenseStatus: true,
  licensingChecklist: true,
  storageGost: true,
  storageJournal: true,
  storageCompliance: true,
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function readOpType(clientId: string): OperationType | null {
  try {
    const raw = localStorage.getItem(`checklist_optype_${clientId}`)
    if (!raw) return null
    return raw as OperationType
  } catch {
    return null
  }
}

function readLicensingState(clientId: string, op: OperationType) {
  try {
    const raw = localStorage.getItem(`licensing_checklist_${clientId}_${op}`)
    if (!raw) return { items: {} as Record<string, { status: ItemStatus; dueDate?: string }> }
    const parsed = JSON.parse(raw) as { items?: Record<string, { status: ItemStatus; dueDate?: string }> }
    return { items: parsed.items ?? {} }
  } catch {
    return { items: {} }
  }
}

function statusSymbol(status: ItemStatus | undefined): string {
  if (status === 'done') return '✅'
  if (status === 'na') return '—'
  return '○'
}

type StorageReadingRow = {
  recorded_at: string
  temperature: number
  humidity: number
  recorded_by?: string
}

function readReadings(warehouseId: string): StorageReadingRow[] {
  try {
    const raw = localStorage.getItem(`storage_readings_${warehouseId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function readCompliance(warehouseId: string): Record<string, { status?: string }> {
  try {
    const raw = localStorage.getItem(`compliance_${warehouseId}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function complianceStatusLabel(status: string | undefined): string {
  if (status === 'done') return '✅ Выполнено'
  if (status === 'na') return '— Н/П'
  return '○ Не выполнено'
}

function licenseBadgeText(license: License | null): string {
  if (!license?.expiry_date) return 'Нет лицензии'
  const days = differenceInDays(parseISO(license.expiry_date), new Date())
  if (days < 0) return 'Лицензия истекла'
  if (days <= 90) return `Истекает через ${days} дн.`
  return 'Лицензия активна'
}

function filterReadingsByRange(
  readings: StorageReadingRow[],
  range: JournalRange,
): StorageReadingRow[] {
  if (range === 'all') return [...readings].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
  const cutoff = subDays(new Date(), range)
  return readings
    .filter((r) => parseISO(r.recorded_at) >= cutoff)
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
}

export function ReportExport({ client, license, warehouses }: ReportExportProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [sections, setSections] = useState<ReportSections>(DEFAULT_SECTIONS)
  const [journalRange, setJournalRange] = useState<JournalRange>(30)

  useEffect(() => {
    if (!modalOpen) return
    const onEsc = () => setModalOpen(false)
    window.addEventListener('checklist:escape', onEsc)
    return () => window.removeEventListener('checklist:escape', onEsc)
  }, [modalOpen])

  const warehouseRows = warehouses as WarehouseRow[]
  const operationType = useMemo(() => readOpType(client.id), [client.id])

  const licensingProgress = useMemo(() => {
    if (!operationType) return { done: 0, total: 0, pct: 0 }
    const items = getCheckableItems(operationType)
    const state = readLicensingState(client.id, operationType).items
    const applicable = items.filter((i) => (state[String(i.id)]?.status ?? 'pending') !== 'na')
    const done = applicable.filter((i) => state[String(i.id)]?.status === 'done').length
    const total = applicable.length
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
  }, [client.id, operationType])

  const journalStats = useMemo(() => {
    let count = 0
    for (const w of warehouseRows) {
      count += filterReadingsByRange(readReadings(w.id), journalRange).length
    }
    return { warehouses: warehouseRows.length, readings: count }
  }, [warehouseRows, journalRange])

  const generatePdf = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const now = new Date()
    const reportDate = format(now, 'd MMMM yyyy', { locale: ru })
    const displayName = client.short_name?.trim() || client.name
    const requisites = [
      client.inn && `ИНН ${client.inn}`,
      client.kpp && `КПП ${client.kpp}`,
      client.ogrn && `ОГРН ${client.ogrn}`,
    ]
      .filter(Boolean)
      .join(' · ')

    const parts: string[] = []

    parts.push(`
      <div class="title-page">
        <div class="watermark">Конфиденциально</div>
        <div class="logo">ЧЕК-Лист</div>
        <h1>${escapeHtml(displayName)}</h1>
        <p class="meta">${escapeHtml(requisites)}</p>
        <p class="badge">${escapeHtml(licenseBadgeText(license))}</p>
        <p class="meta">Дата отчёта: ${escapeHtml(reportDate)}</p>
      </div>
    `)

    if (sections.clientInfo) {
      const director = [client.director_last_name, client.director_first_name, client.director_middle_name]
        .filter(Boolean)
        .join(' ')
      const rows = [
        ['Наименование', client.name],
        ['Краткое наименование', client.short_name ?? '—'],
        ['ИНН', client.inn ?? '—'],
        ['КПП', client.kpp ?? '—'],
        ['ОГРН', client.ogrn ?? '—'],
        ['Юридический адрес', client.legal_address ?? '—'],
        ['Руководитель', director || (client.contact_person ?? '—')],
        ['Телефон', client.phone ?? client.director_phone ?? '—'],
        ['Email', client.email ?? '—'],
      ]
        .map(
          ([k, v]) =>
            `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`,
        )
        .join('')
      parts.push(`
        <h2>1. Информация о клиенте</h2>
        <table><tbody>${rows}</tbody></table>
      `)
    }

    if (sections.licenseStatus && license) {
      const days =
        license.expiry_date && isValid(parseISO(license.expiry_date))
          ? differenceInDays(parseISO(license.expiry_date), now)
          : null
      parts.push(`
        <h2>2. Статус лицензии</h2>
        <table>
          <tbody>
            <tr><th>Номер</th><td>${escapeHtml(license.license_number ?? '—')}</td></tr>
            <tr><th>Дата выдачи</th><td>${license.issue_date ? escapeHtml(format(parseISO(license.issue_date), 'dd.MM.yyyy')) : '—'}</td></tr>
            <tr><th>Дата окончания</th><td>${license.expiry_date ? escapeHtml(format(parseISO(license.expiry_date), 'dd.MM.yyyy')) : '—'}</td></tr>
            <tr><th>Осталось дней</th><td>${days !== null ? String(days) : '—'}</td></tr>
            <tr><th>Статус</th><td>${escapeHtml(licenseBadgeText(license))}</td></tr>
          </tbody>
        </table>
      `)
    }

    if (sections.licensingChecklist && operationType) {
      const state = readLicensingState(client.id, operationType).items
      let blockHtml = ''
      for (const block of LICENSING_BLOCKS.filter((b) => blockApplies(b, operationType))) {
        const blockItems = getItemsForOperation(operationType).filter(
          (i) => i.block === block.num && i.mode !== 'info',
        )
        if (blockItems.length === 0) continue
        const rows = blockItems
          .map((item) => {
            const st = state[String(item.id)]
            return `<tr>
              <td>${item.id}</td>
              <td>${escapeHtml(item.title)}</td>
              <td>${statusSymbol(st?.status)}</td>
              <td>${st?.dueDate && isValid(parseISO(st.dueDate)) ? format(parseISO(st.dueDate), 'dd.MM.yyyy') : '—'}</td>
            </tr>`
          })
          .join('')
        blockHtml += `<h3>Блок ${block.num} — ${escapeHtml(block.title)}</h3>
          <table><thead><tr><th>№</th><th>Документ</th><th>Статус</th><th>Срок</th></tr></thead><tbody>${rows}</tbody></table>`
      }
      parts.push(`<h2>3. Чеклист лицензирования (${escapeHtml(operationType)})</h2>${blockHtml}`)
    }

    if (sections.storageGost || sections.storageJournal || sections.storageCompliance) {
      for (const w of warehouseRows) {
        const wname = warehouseDisplayTitle(w)
        const address = w.address || '—'
        let wh = `<h2>Склад: ${escapeHtml(wname)}</h2><p class="meta">Адрес (ЕГРН): ${escapeHtml(address)}</p>`

        if (sections.storageGost) {
          const types = parseProductTypes(w.product_types)
          if (types.length === 0) {
            wh += `<h3>Требования ГОСТ</h3><p class="meta">Типы продукции не выбраны</p>`
          } else {
            const range = computeSafeRange(types)
            const rows = types
              .map((t: ProductType) => {
                const n = GOST_DATA[t]
                return `<tr>
                  <td>${escapeHtml(n.label)}</td>
                  <td>${escapeHtml(n.gost)}</td>
                  <td>${n.tempMin}…${n.tempMax}°C</td>
                  <td>${n.humidityMin}…${n.humidityMax}%</td>
                </tr>`
              })
              .join('')
            const combined = range
              ? `Совмещённый диапазон: ${range.tempMin}…${range.tempMax}°C, влажность ${range.humidityMin}…${range.humidityMax}%${range.compatible ? '' : ' (несовместимо)'}`
              : ''
            wh += `<h3>Требования ГОСТ</h3>
              <table><thead><tr><th>Продукция</th><th>ГОСТ</th><th>Температура</th><th>Влажность</th></tr></thead><tbody>${rows}</tbody></table>
              <p class="meta">${escapeHtml(combined)}</p>`
          }
        }

        if (sections.storageJournal) {
          const readings = filterReadingsByRange(readReadings(w.id), journalRange)
          const rangeLabel =
            journalRange === 'all' ? 'всё время' : `последние ${journalRange} дн.`
          const rows =
            readings.length === 0
              ? '<tr><td colspan="5">Нет записей</td></tr>'
              : readings
                  .map((r) => {
                    const dt = parseISO(r.recorded_at)
                    return `<tr>
                      <td>${format(dt, 'dd.MM.yyyy')}</td>
                      <td>${format(dt, 'HH:mm')}</td>
                      <td>${r.temperature}°C</td>
                      <td>${r.humidity}%</td>
                      <td>${escapeHtml(r.recorded_by ?? '—')}</td>
                    </tr>`
                  })
                  .join('')
          wh += `<h3>Журнал условий хранения (${rangeLabel})</h3>
            <table><thead><tr><th>Дата</th><th>Время</th><th>t°C</th><th>Влажность</th><th>Замерял</th></tr></thead><tbody>${rows}</tbody></table>`
        }

        if (sections.storageCompliance) {
          const comp = readCompliance(w.id)
          const hasStock = warehouseHasStock(w.product_types)
          const complianceRows = getApplicableComplianceItems(hasStock)
          const rows = complianceRows
            .map(
              (row) => `<tr>
              <td>${escapeHtml(row.text)}</td>
              <td>${complianceStatusLabel(comp[row.id]?.status)}</td>
            </tr>`,
            )
            .join('')
          wh += `<h3>Требования 289н и условия хранения</h3>
            <table><thead><tr><th>Пункт</th><th>Статус</th></tr></thead><tbody>${rows}</tbody></table>`
        }

        parts.push(wh)
      }
    }

    const attention: string[] = []
    if (operationType) {
      const state = readLicensingState(client.id, operationType).items
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      for (const item of getCheckableItems(operationType)) {
        const st = state[String(item.id)]
        if (!st || st.status === 'done' || st.status === 'na') continue
        if (st.dueDate && isValid(parseISO(st.dueDate)) && parseISO(st.dueDate) < today) {
          attention.push(`Просрочен: ${item.title}`)
        } else if (st.status === 'pending') {
          attention.push(`Не выполнен: ${item.title}`)
        }
      }
    }
    const attentionHtml =
      attention.length === 0
        ? '<p class="meta">Нет пунктов, требующих внимания</p>'
        : `<ul>${attention.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`

    parts.push(`
      <h2>Итоговая сводка</h2>
      <ul>
        <li>Лицензионный чеклист: ${licensingProgress.done}/${licensingProgress.total} готово (${licensingProgress.pct}%)</li>
        <li>Условия хранения: ${journalStats.warehouses} складов, ${journalStats.readings} записей в журнале (выбранный период)</li>
      </ul>
      <h3>Пункты, требующие внимания</h3>
      ${attentionHtml}
      <div class="signatures">
        <p>Исполнитель: _____________ / ИП Геворкян Н.С.</p>
        <p>Заказчик: _____________ / ${escapeHtml(client.name)}</p>
        <p>Дата: _____________</p>
      </div>
    `)

    printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Отчёт — ${escapeHtml(displayName)}</title>
      <style>
        @page { margin: 18mm; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 20px; position: relative; }
        .watermark {
          position: fixed; top: 35%; left: 10%; font-size: 64px; color: rgba(180,180,180,0.25);
          transform: rotate(-30deg); pointer-events: none; z-index: 0; white-space: nowrap;
        }
        .title-page { text-align: center; padding: 40px 20px 60px; page-break-after: always; position: relative; }
        .logo {
          width: 80px; height: 80px; margin: 0 auto 24px; background: #e2e8f0; color: #64748b;
          display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11px;
          border-radius: 8px;
        }
        .title-page h1 { font-size: 22px; margin: 0 0 8px; position: relative; z-index: 1; }
        .title-page .meta { color: #555; font-size: 12px; position: relative; z-index: 1; }
        .title-page .badge {
          display: inline-block; margin: 12px 0; padding: 6px 14px; border-radius: 999px;
          background: #f1f5f9; font-weight: 600; position: relative; z-index: 1;
        }
        h2 { font-size: 15px; margin: 28px 0 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; page-break-after: avoid; }
        h3 { font-size: 13px; margin: 16px 0 8px; page-break-after: avoid; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; page-break-inside: avoid; }
        th, td { border: 1px solid #d1d5db; padding: 5px 8px; text-align: left; vertical-align: top; }
        th { background: #f8fafc; width: 32%; }
        .meta { color: #64748b; font-size: 10px; margin: 4px 0 12px; }
        ul { margin: 8px 0; padding-left: 20px; }
        .signatures { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
        .signatures p { margin: 12px 0; font-size: 12px; }
        .footer { margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: center; }
      </style>
    </head>
    <body>
      ${parts.join('\n')}
      <div class="footer">ЧЕК-Лист · Сформирован: ${escapeHtml(format(now, 'd MMMM yyyy, HH:mm', { locale: ru }))}</div>
    </body>
    </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    window.setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 300)
    setModalOpen(false)
  }

  return (
    <div className="space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Сводный отчёт</h2>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          📄 Сформировать отчёт
        </button>
      </div>

      <p className="text-sm text-slate-500">
        Полный PDF-отчёт по клиенту: реквизиты, лицензия, чеклисты и склады. Данные берутся из
        localStorage и текущих записей приложения.
      </p>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="font-semibold text-slate-900">Параметры отчёта</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-md text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-800 mb-2">Разделы отчёта</legend>
                {(
                  [
                    ['clientInfo', 'Общая информация о клиенте'],
                    ['licenseStatus', 'Статус лицензии'],
                    ['licensingChecklist', 'Чеклист лицензирования'],
                    ['storageGost', 'Условия хранения (ГОСТ)'],
                    ['storageJournal', 'Журнал условий хранения'],
                    ['storageCompliance', 'Чеклист условий хранения'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={sections[key]}
                      onChange={(e) =>
                        setSections((s) => ({ ...s, [key]: e.target.checked }))
                      }
                      className="rounded border-slate-300 text-brand-600"
                    />
                    {label}
                  </label>
                ))}
              </fieldset>

              <label className="block text-sm">
                <span className="font-medium text-slate-800">Журнал — за последние</span>
                <select
                  value={String(journalRange)}
                  onChange={(e) => {
                    const v = e.target.value
                    setJournalRange(v === 'all' ? 'all' : (Number(v) as JournalRange))
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="7">7 дней</option>
                  <option value="30">30 дней</option>
                  <option value="90">90 дней</option>
                  <option value="all">всё время</option>
                </select>
              </label>

              {!operationType && sections.licensingChecklist && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  Чеклист лицензирования не выбран на вкладке «Чеклист» — раздел будет пустым.
                </p>
              )}

              <button
                type="button"
                onClick={generatePdf}
                className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Сформировать PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

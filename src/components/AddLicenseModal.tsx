import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Database,
  FileText,
  Loader2,
  Plus,
  Upload,
  X,
} from 'lucide-react'
import { format, isValid, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import { parseLicensePdf } from '../lib/licenseParser'
import {
  loadFromCache,
  normalizeLicenseStatus,
  registryRecordToLicenseUpsert,
  type LicenseRecord,
} from '../lib/licenseRegistry'
import type { License, ParsedLicenseData } from '../types'

export const LICENSE_ACTIVITY_OPTIONS = [
  'Закупка, хранение и поставки алкогольной продукции',
  'Розничная продажа алкогольной продукции',
  'Розничная продажа при оказании услуг общественного питания',
  'Производство алкогольной продукции',
  'Закупка, хранение и поставки спиртосодержащей пищевой продукции',
  'Закупка, хранение и поставки спиртосодержащей непищевой продукции',
  'Производство этилового спирта',
  'Иное',
] as const

export const LICENSE_STATUS_OPTIONS = ['действующая', 'приостановлена'] as const

export interface AddLicenseFormState {
  license_number: string
  license_type: string
  issue_date: string
  expiry_date: string
  license_status: string
}

type InputMode = 'manual' | 'pdf' | 'registry'

function emptyForm(): AddLicenseFormState {
  return {
    license_number: '',
    license_type: '',
    issue_date: '',
    expiry_date: '',
    license_status: 'действующая',
  }
}

function licenseToForm(license: License | null): AddLicenseFormState {
  if (!license) return emptyForm()
  return {
    license_number: license.license_number ?? '',
    license_type: license.license_activity ?? license.license_type ?? '',
    issue_date: license.issue_date ?? '',
    expiry_date: license.expiry_date ?? '',
    license_status: normalizeLicenseStatus(license.license_status ?? 'действующая'),
  }
}

function isoToDisplay(iso: string): string {
  if (!iso?.trim()) return ''
  const d = parseISO(iso)
  if (!isValid(d)) return iso
  return format(d, 'dd.MM.yyyy', { locale: ru })
}

function displayToIso(display: string): string {
  const m = display.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return ''
  const day = m[1].padStart(2, '0')
  const month = m[2].padStart(2, '0')
  const year = m[3]
  const d = parseISO(`${year}-${month}-${day}`)
  return isValid(d) ? `${year}-${month}-${day}` : ''
}

function parsedToForm(data: ParsedLicenseData): AddLicenseFormState {
  return {
    license_number: data.licenseNumber.trim(),
    license_type: data.licenseActivity.trim(),
    issue_date: data.issueDate.trim(),
    expiry_date: data.expiryDate.trim(),
    license_status: normalizeLicenseStatus(data.licenseStatus || 'действующая'),
  }
}

function registryRecordToForm(record: LicenseRecord): AddLicenseFormState {
  const mapped = registryRecordToLicenseUpsert(record, '')
  return {
    license_number: mapped.license_number ?? '',
    license_type: mapped.license_type ?? '',
    issue_date: mapped.issue_date ?? '',
    expiry_date: mapped.expiry_date ?? '',
    license_status: mapped.license_status ?? 'действующая',
  }
}

function hasParsedLicenseNumber(data: ParsedLicenseData): boolean {
  return Boolean(data.licenseNumber.trim())
}

function formatRegistryExpiry(iso: string | null): string {
  if (!iso) return '—'
  const d = parseISO(iso)
  if (!isValid(d)) return iso
  return format(d, 'dd.MM.yyyy', { locale: ru })
}

interface AddLicenseModalProps {
  open: boolean
  license: License | null
  clientInn: string | null | undefined
  saving?: boolean
  onClose: () => void
  onSave: (data: AddLicenseFormState) => void | Promise<void>
}

export function AddLicenseModal({
  open,
  license,
  clientInn,
  saving = false,
  onClose,
  onSave,
}: AddLicenseModalProps) {
  const [mode, setMode] = useState<InputMode>('manual')
  const [form, setForm] = useState<AddLicenseFormState>(emptyForm())
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [parseWarning, setParseWarning] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [registryActive, setRegistryActive] = useState<LicenseRecord[]>([])
  const [registryArchived, setRegistryArchived] = useState<LicenseRecord[]>([])
  const [selectedRegistryKey, setSelectedRegistryKey] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasRegistryData = registryActive.length > 0 || registryArchived.length > 0

  useEffect(() => {
    if (!open) return
    setForm(licenseToForm(license))
    setErrors({})
    setParseWarning(null)
    setMode('manual')
    setSelectedRegistryKey(null)
    setRegistryError(null)
  }, [license, open])

  useEffect(() => {
    if (!open) return
    const onEsc = () => onClose()
    window.addEventListener('checklist:escape', onEsc)
    return () => window.removeEventListener('checklist:escape', onEsc)
  }, [open, onClose])

  const loadRegistry = useCallback(async () => {
    const inn = clientInn?.replace(/\D/g, '') ?? ''
    if (!inn) {
      setRegistryActive([])
      setRegistryArchived([])
      return
    }
    setRegistryLoading(true)
    setRegistryError(null)
    try {
      const res = await loadFromCache(inn)
      setRegistryActive(res.active)
      setRegistryArchived(res.archived)
    } catch (e) {
      setRegistryActive([])
      setRegistryArchived([])
      setRegistryError(e instanceof Error ? e.message : 'Ошибка загрузки реестра')
    } finally {
      setRegistryLoading(false)
    }
  }, [clientInn])

  useEffect(() => {
    if (!open || !clientInn?.replace(/\D/g, '')) return
    void loadRegistry()
  }, [open, clientInn, loadRegistry])

  const registryRows = useMemo(
    () => [
      ...registryActive.map((r) => ({ record: r, archived: false })),
      ...registryArchived.map((r) => ({ record: r, archived: true })),
    ],
    [registryActive, registryArchived],
  )

  const handlePdfFile = async (file: File) => {
    setPdfLoading(true)
    setParseWarning(null)
    try {
      const parsed = await parseLicensePdf(file)
      if (hasParsedLicenseNumber(parsed)) {
        setForm(parsedToForm(parsed))
        setParseWarning(
          parsed.expiryDate.trim()
            ? null
            : 'Не удалось распознать автоматически, заполните вручную',
        )
        setMode('manual')
      } else {
        setForm(emptyForm())
        setParseWarning('Не удалось распознать автоматически, заполните вручную')
        setMode('manual')
      }
    } catch {
      setForm(emptyForm())
      setParseWarning('Не удалось распознать автоматически, заполните вручную')
      setMode('manual')
    } finally {
      setPdfLoading(false)
    }
  }

  const applyRegistrySelection = () => {
    const row = registryRows.find(
      ({ record }) => `${record.license_number}|${record.valid_to}` === selectedRegistryKey,
    )
    if (!row) return
    setForm(registryRecordToForm(row.record))
    setMode('manual')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const issueDate = form.issue_date.includes('.')
      ? displayToIso(form.issue_date)
      : form.issue_date
    const expiryDate = form.expiry_date.includes('.')
      ? displayToIso(form.expiry_date)
      : form.expiry_date

    const nextErrors: Partial<Record<string, string>> = {}
    if (!form.license_number.trim()) nextErrors.license_number = 'Укажите номер лицензии'
    if (!form.license_type.trim()) nextErrors.license_type = 'Укажите вид деятельности'
    if (!expiryDate.trim()) {
      nextErrors.expiry_date = 'Укажите дату окончания'
    } else if (!isValid(parseISO(expiryDate))) {
      nextErrors.expiry_date = 'Некорректная дата (дд.мм.гггг)'
    }
    if (issueDate.trim() && !isValid(parseISO(issueDate))) {
      nextErrors.issue_date = 'Некорректная дата (дд.мм.гггг)'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    void onSave({
      ...form,
      issue_date: issueDate,
      expiry_date: expiryDate,
    })
  }

  if (!open) return null

  const modeButtons: { key: InputMode; label: string; icon: typeof FileText; hidden?: boolean }[] =
    [
      { key: 'manual', label: 'Ввести вручную', icon: FileText },
      { key: 'pdf', label: 'Загрузить PDF', icon: Upload },
      { key: 'registry', label: 'Из реестра РАТ', icon: Database, hidden: !hasRegistryData && !registryLoading },
    ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">
            {license ? 'Редактировать лицензию' : 'Добавить лицензию'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-slate-100"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {modeButtons
            .filter((b) => !b.hidden)
            .map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium min-h-[40px] ${
                  mode === key
                    ? 'border-brand-600 bg-brand-50 text-brand-800'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </button>
            ))}
        </div>

        {mode === 'pdf' && (
          <div className="mb-4 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handlePdfFile(file)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              disabled={pdfLoading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[44px] rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-700 hover:border-brand-400 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {pdfLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {pdfLoading ? 'Распознавание…' : 'Выбрать PDF лицензии'}
            </button>
            <p className="text-xs text-slate-500">
              После загрузки поля формы заполнятся автоматически или откроются для ручного ввода.
            </p>
          </div>
        )}

        {mode === 'registry' && (
          <div className="mb-4 space-y-3">
            {registryLoading ? (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Загрузка из реестра…
              </p>
            ) : registryError ? (
              <p className="text-sm text-red-600">{registryError}</p>
            ) : registryRows.length === 0 ? (
              <p className="text-sm text-slate-500">В кэше реестра нет лицензий для этого ИНН.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {registryRows.map(({ record, archived }) => {
                  const key = `${record.license_number}|${record.valid_to}`
                  const selected = selectedRegistryKey === key
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setSelectedRegistryKey(key)}
                        className={`w-full text-left rounded-md px-2 py-2 text-sm flex items-start gap-2 hover:bg-slate-50 ${
                          selected ? 'bg-brand-50' : ''
                        } ${archived ? 'text-slate-500' : 'text-slate-800'}`}
                      >
                        <span className="mt-0.5 shrink-0 w-4">
                          {selected ? (
                            <Check className="h-4 w-4 text-brand-600" />
                          ) : (
                            <span className="inline-block h-4 w-4 rounded border border-slate-300" />
                          )}
                        </span>
                        <span>
                          <span className="font-medium">{record.license_number}</span>
                          {' — '}
                          {record.license_label}
                          {' — до '}
                          {formatRegistryExpiry(record.valid_to)}
                          {archived && (
                            <span className="text-slate-400"> (архив)</span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <button
              type="button"
              disabled={!selectedRegistryKey}
              onClick={applyRegistrySelection}
              className="w-full min-h-[44px] rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Применить выбранную
            </button>
          </div>
        )}

        {(mode === 'manual' || parseWarning) && (
          <form onSubmit={handleSubmit} className="space-y-3">
            {parseWarning && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {parseWarning}
              </p>
            )}

            <label className="block text-sm">
              <span className="text-slate-600">
                Номер лицензии <span className="text-red-500">*</span>
              </span>
              <input
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                  errors.license_number ? 'border-red-400' : 'border-slate-300'
                }`}
                placeholder="77ЗАП0014689"
                value={form.license_number}
                onChange={(e) => {
                  setForm((f) => ({ ...f, license_number: e.target.value }))
                  if (errors.license_number) {
                    setErrors((err) => ({ ...err, license_number: undefined }))
                  }
                }}
              />
              {errors.license_number && (
                <p className="mt-0.5 text-xs text-red-600">{errors.license_number}</p>
              )}
            </label>

            <label className="block text-sm">
              <span className="text-slate-600">
                Вид деятельности <span className="text-red-500">*</span>
              </span>
              <div className="relative mt-1">
                <select
                  className={`w-full appearance-none rounded-md border px-3 py-2 pr-9 text-sm ${
                    errors.license_type ? 'border-red-400' : 'border-slate-300'
                  }`}
                  value={form.license_type}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, license_type: e.target.value }))
                    if (errors.license_type) {
                      setErrors((err) => ({ ...err, license_type: undefined }))
                    }
                  }}
                >
                  <option value="">— выберите —</option>
                  {LICENSE_ACTIVITY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              {errors.license_type && (
                <p className="mt-0.5 text-xs text-red-600">{errors.license_type}</p>
              )}
            </label>

            <label className="block text-sm">
              <span className="text-slate-600">Дата выдачи</span>
              <input
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                  errors.issue_date ? 'border-red-400' : 'border-slate-300'
                }`}
                placeholder="дд.мм.гггг"
                inputMode="numeric"
                value={isoToDisplay(form.issue_date)}
                onChange={(e) => {
                  const iso = displayToIso(e.target.value)
                  setForm((f) => ({ ...f, issue_date: iso || e.target.value }))
                  if (errors.issue_date) {
                    setErrors((err) => ({ ...err, issue_date: undefined }))
                  }
                }}
                onBlur={(e) => {
                  const iso = displayToIso(e.target.value)
                  if (iso) setForm((f) => ({ ...f, issue_date: iso }))
                }}
              />
              {errors.issue_date && (
                <p className="mt-0.5 text-xs text-red-600">{errors.issue_date}</p>
              )}
            </label>

            <label className="block text-sm">
              <span className="text-slate-600">
                Дата окончания <span className="text-red-500">*</span>
              </span>
              <input
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                  errors.expiry_date ? 'border-red-400' : 'border-slate-300'
                }`}
                placeholder="дд.мм.гггг"
                inputMode="numeric"
                value={isoToDisplay(form.expiry_date)}
                onChange={(e) => {
                  const iso = displayToIso(e.target.value)
                  setForm((f) => ({ ...f, expiry_date: iso || e.target.value }))
                  if (errors.expiry_date) {
                    setErrors((err) => ({ ...err, expiry_date: undefined }))
                  }
                }}
                onBlur={(e) => {
                  const iso = displayToIso(e.target.value)
                  if (iso) setForm((f) => ({ ...f, expiry_date: iso }))
                }}
              />
              {errors.expiry_date && (
                <p className="mt-0.5 text-xs text-red-600">{errors.expiry_date}</p>
              )}
            </label>

            <label className="block text-sm">
              <span className="text-slate-600">Статус</span>
              <div className="relative mt-1">
                <select
                  className="w-full appearance-none rounded-md border border-slate-300 px-3 py-2 pr-9 text-sm"
                  value={form.license_status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, license_status: e.target.value }))
                  }
                >
                  {LICENSE_STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 min-h-[44px] rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                {!license && <Plus className="h-4 w-4" />}
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 min-h-[44px] rounded-lg border border-slate-300 py-2 text-sm"
              >
                Отмена
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

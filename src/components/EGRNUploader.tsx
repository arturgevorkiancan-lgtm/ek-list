import { useCallback, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Upload, FileText, Loader2, Building2 } from 'lucide-react'
import { differenceInDays, isValid, parseISO } from 'date-fns'
import { parseEGRNFile, parseEGRNText, parseEGRYLPdf } from '../lib/egrnParser'
import type { DataSource } from '../lib/conflictDetector'
import {
  applyFieldToEgryl,
  egrylToDataSource,
  mergedToEgrylForm,
} from '../lib/conflictMappers'
import { useDocumentConflicts } from '../hooks/useDocumentConflicts'
import { ConflictTable } from './ConflictTable'
import type { ParsedEGRN, ParsedEGRYLData } from '../types'

const EMPTY_EGRN: ParsedEGRN = {
  address: '',
  cadastralNumber: '',
  ownerName: '',
  area: '',
  rightType: '',
  registrationDate: '',
}

const EMPTY_EGRYL: ParsedEGRYLData = {
  client: {
    fullName: '',
    shortName: '',
    ogrn: '',
    inn: '',
    kpp: '',
    legalAddress: '',
    registrationDate: '',
  },
  rawText: '',
}

function getExpiryDaysLeft(dateStr: string): number | null {
  if (!dateStr.trim()) return null
  const parsed = parseISO(dateStr)
  if (!isValid(parsed)) return null
  return differenceInDays(parsed, new Date())
}

function ExpiryHint({ dateStr }: { dateStr: string }) {
  const daysLeft = getExpiryDaysLeft(dateStr)
  if (daysLeft === null) return null

  const urgent = daysLeft < 180
  const expired = daysLeft < 0
  const label = expired
    ? `истекла ${Math.abs(daysLeft)} дн. назад`
    : `осталось ${daysLeft} дн.`

  return (
    <span
      className={`ml-2 text-xs font-medium ${
        expired ? 'text-red-600' : urgent ? 'text-orange-600' : 'text-slate-500'
      }`}
    >
      ({label})
    </span>
  )
}

function fieldInputClass(unresolved: boolean, extra = '') {
  return `mt-1 w-full rounded-md border px-3 py-2 text-sm ${extra} ${
    unresolved ? 'border-red-500 ring-1 ring-red-200' : 'border-slate-300'
  }`
}

function EgrylField({
  label,
  badge,
  children,
}: {
  label: string
  badge: string | null
  children: ReactNode
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">
        {label}
        {badge && <span className="ml-2 text-xs font-normal text-slate-500">{badge}</span>}
      </span>
      {children}
    </label>
  )
}

interface EGRNUploaderProps {
  onConfirmEGRN: (data: ParsedEGRN) => void
  onConfirmEGRYL: (data: ParsedEGRYLData, addLicense: boolean) => void
  parsedSources?: DataSource[]
  onParsedSourcesChange?: Dispatch<SetStateAction<DataSource[]>>
}

export function EGRNUploader({
  onConfirmEGRN,
  onConfirmEGRYL,
  parsedSources: controlledSources,
  onParsedSourcesChange,
}: EGRNUploaderProps) {
  const [internalSources, setInternalSources] = useState<DataSource[]>([])
  const parsedSources = controlledSources ?? internalSources
  const setParsedSources = onParsedSourcesChange ?? setInternalSources

  const {
    conflicts,
    selectedByField,
    unresolvedFieldKeys,
    manualOverrides,
    addSource,
    resetSources,
    handleConflictSelect,
    markManual,
    isUnresolved,
    getBadge,
    hasConflicts,
  } = useDocumentConflicts(parsedSources, setParsedSources)

  const onEgrylConflictResolve = useCallback(
    (fieldKey: string, value: string) => {
      handleConflictSelect(fieldKey, value)
      applyFieldToEgryl(fieldKey, value, setEgrylForm)
    },
    [handleConflictSelect],
  )
  const [egrnDragging, setEgrnDragging] = useState(false)
  const [egrylDragging, setEgrylDragging] = useState(false)
  const [egrnLoading, setEgrnLoading] = useState(false)
  const [egrylLoading, setEgrylLoading] = useState(false)
  const [egrnError, setEgrnError] = useState<string | null>(null)
  const [egrylError, setEgrylError] = useState<string | null>(null)
  const [egrnParsed, setEgrnParsed] = useState(false)
  const [egrylParsed, setEgrylParsed] = useState(false)
  const [egrnForm, setEgrnForm] = useState<ParsedEGRN>(EMPTY_EGRN)
  const [egrylForm, setEgrylForm] = useState<ParsedEGRYLData>(EMPTY_EGRYL)

  const handleEgrnFile = useCallback(async (file: File) => {
    setEgrnError(null)
    setEgrnLoading(true)
    try {
      const result = await parseEGRNFile(file)
      setEgrnForm({ ...EMPTY_EGRN, ...result })
      setEgrnParsed(true)
    } catch (e) {
      setEgrnError(e instanceof Error ? e.message : 'Ошибка парсинга')
    } finally {
      setEgrnLoading(false)
    }
  }, [])

  const handleEgrylFile = useCallback(async (file: File) => {
    setEgrylError(null)
    setEgrylLoading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext !== 'pdf') throw new Error('Выписка ЕГРЮЛ поддерживается только в формате PDF')
      const result = await parseEGRYLPdf(file)
      const source = egrylToDataSource(result)
      addSource(source, (mergedData) =>
        setEgrylForm((prev) => mergedToEgrylForm(mergedData, { ...prev, ...result })),
      )
      setEgrylParsed(true)
    } catch (e) {
      setEgrylError(e instanceof Error ? e.message : 'Ошибка парсинга')
    } finally {
      setEgrylLoading(false)
    }
  }, [])

  const handleEgrylConfirm = () => {
    let addLicense = false
    if (egrylForm.license?.licenseNumber) {
      const msg = `Найдена лицензия ${egrylForm.license.licenseNumber}, добавить в карточку?`
      addLicense = window.confirm(msg)
    }
    onConfirmEGRYL(egrylForm, addLicense)
    setEgrylParsed(false)
    setEgrylForm(EMPTY_EGRYL)
    resetSources()
  }

  const licenseExpiryDays = egrylForm.license?.expiryDate
    ? getExpiryDaysLeft(egrylForm.license.expiryDate)
    : null
  const licenseExpiryUrgent =
    licenseExpiryDays !== null && licenseExpiryDays >= 0 && licenseExpiryDays < 180

  const dropZoneClass = (dragging: boolean) =>
    `rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
      dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50'
    }`

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Выписка из ЕГРН (объект недвижимости)</p>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setEgrnDragging(true)
          }}
          onDragLeave={() => setEgrnDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setEgrnDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) void handleEgrnFile(file)
          }}
          className={dropZoneClass(egrnDragging)}
        >
          {egrnLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
              <p className="text-sm text-slate-600">Разбор выписки ЕГРН…</p>
            </div>
          ) : (
            <Upload className="mx-auto h-8 w-8 text-slate-400" />
          )}
          <p className="mt-2 text-sm text-slate-600">
            Перетащите выписку ЕГРН (.docx, .pdf) или{' '}
            <label className="cursor-pointer font-medium text-brand-600 hover:underline">
              выберите файл
              <input
                type="file"
                accept=".docx,.pdf"
                className="hidden"
                disabled={egrnLoading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleEgrnFile(f)
                }}
              />
            </label>
          </p>
        </div>
        {egrnError && <p className="mt-2 text-sm text-red-600">{egrnError}</p>}

        {(egrnParsed || egrnForm.address) && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <FileText className="h-4 w-4" />
              Данные объекта (ЕГРН)
            </div>
            <label className="block text-sm">
              <span className="text-slate-600">Адрес объекта</span>
              <textarea
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                rows={2}
                value={egrnForm.address}
                onChange={(e) => setEgrnForm((f) => ({ ...f, address: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Кадастровый номер</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={egrnForm.cadastralNumber}
                onChange={(e) => setEgrnForm((f) => ({ ...f, cadastralNumber: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Правообладатель / Арендатор</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={egrnForm.ownerName}
                onChange={(e) => setEgrnForm((f) => ({ ...f, ownerName: e.target.value }))}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="text-slate-600">Площадь (кв.м)</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={egrnForm.area ?? ''}
                  onChange={(e) => setEgrnForm((f) => ({ ...f, area: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Вид права</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={egrnForm.rightType ?? ''}
                  onChange={(e) => setEgrnForm((f) => ({ ...f, rightType: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Дата регистрации</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={egrnForm.registrationDate ?? ''}
                  onChange={(e) => setEgrnForm((f) => ({ ...f, registrationDate: e.target.value }))}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => onConfirmEGRN(egrnForm)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Применить данные ЕГРН
            </button>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">
          Выписка из ЕГРЮЛ (для реквизитов организации)
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setEgrylDragging(true)
          }}
          onDragLeave={() => setEgrylDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setEgrylDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) void handleEgrylFile(file)
          }}
          className={dropZoneClass(egrylDragging)}
        >
          {egrylLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
              <p className="text-sm text-slate-600">Разбор выписки ЕГРЮЛ…</p>
            </div>
          ) : (
            <Building2 className="mx-auto h-8 w-8 text-slate-400" />
          )}
          <p className="mt-2 text-sm text-slate-600">
            Перетащите выписку ЕГРЮЛ (.pdf) или{' '}
            <label className="cursor-pointer font-medium text-brand-600 hover:underline">
              выберите файл
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                disabled={egrylLoading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleEgrylFile(f)
                }}
              />
            </label>
          </p>
          <p className="mt-1 text-xs text-slate-400">Только PDF</p>
        </div>
        {egrylError && <p className="mt-2 text-sm text-red-600">{egrylError}</p>}

        {egrylParsed && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Building2 className="h-4 w-4" />
              Подтвердите или исправьте данные
            </div>

            {hasConflicts && (
              <ConflictTable
                conflicts={conflicts}
                onResolve={onEgrylConflictResolve}
                selectedByField={selectedByField}
                manualFieldKeys={manualOverrides}
                unresolvedFieldKeys={unresolvedFieldKeys}
              />
            )}

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-1 w-full">
                Реквизиты организации
              </legend>
              <EgrylField
                label="Полное наименование"
                badge={getBadge('fullName')}
              >
                <input
                  className={fieldInputClass(isUnresolved('fullName'))}
                  value={egrylForm.client.fullName}
                  onChange={(e) => {
                    markManual('fullName')
                    setEgrylForm((f) => ({
                      ...f,
                      client: { ...f.client, fullName: e.target.value },
                    }))
                  }}
                />
              </EgrylField>
              <EgrylField
                label="Сокращённое наименование"
                badge={getBadge('shortName')}
              >
                <input
                  className={fieldInputClass(isUnresolved('shortName'))}
                  value={egrylForm.client.shortName}
                  onChange={(e) => {
                    markManual('shortName')
                    setEgrylForm((f) => ({
                      ...f,
                      client: { ...f.client, shortName: e.target.value },
                    }))
                  }}
                />
              </EgrylField>
              <div className="grid gap-3 sm:grid-cols-3">
                <EgrylField
                  label="ОГРН"
                  badge={getBadge('ogrn')}
                >
                  <input
                    className={fieldInputClass(isUnresolved('ogrn'))}
                    value={egrylForm.client.ogrn}
                    onChange={(e) => {
                      markManual('ogrn')
                      setEgrylForm((f) => ({
                        ...f,
                        client: { ...f.client, ogrn: e.target.value },
                      }))
                    }}
                  />
                </EgrylField>
                <EgrylField
                  label="ИНН"
                  badge={getBadge('inn')}
                >
                  <input
                    className={fieldInputClass(isUnresolved('inn'))}
                    value={egrylForm.client.inn}
                    onChange={(e) => {
                      markManual('inn')
                      setEgrylForm((f) => ({
                        ...f,
                        client: { ...f.client, inn: e.target.value },
                      }))
                    }}
                  />
                </EgrylField>
                <EgrylField
                  label="КПП"
                  badge={getBadge('kpp')}
                >
                  <input
                    className={fieldInputClass(isUnresolved('kpp'))}
                    value={egrylForm.client.kpp}
                    onChange={(e) => {
                      markManual('kpp')
                      setEgrylForm((f) => ({
                        ...f,
                        client: { ...f.client, kpp: e.target.value },
                      }))
                    }}
                  />
                </EgrylField>
              </div>
              <EgrylField
                label="Юридический адрес"
                badge={getBadge('legalAddress')}
              >
                <textarea
                  className={fieldInputClass(isUnresolved('legalAddress'))}
                  rows={2}
                  value={egrylForm.client.legalAddress}
                  onChange={(e) => {
                    markManual('legalAddress')
                    setEgrylForm((f) => ({
                      ...f,
                      client: { ...f.client, legalAddress: e.target.value },
                    }))
                  }}
                />
              </EgrylField>
              <label className="block text-sm">
                <span className="text-slate-600">Дата присвоения ОГРН</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={egrylForm.client.registrationDate ?? ''}
                  onChange={(e) =>
                    setEgrylForm((f) => ({
                      ...f,
                      client: { ...f.client, registrationDate: e.target.value },
                    }))
                  }
                />
              </label>
            </fieldset>

            {egrylForm.license && (
              <fieldset className="space-y-3 rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                <legend className="text-sm font-semibold text-slate-800 border-b border-amber-200/60 pb-1 w-full">
                  Данные лицензии
                </legend>
                <EgrylField
                  label="Серия и номер"
                  badge={getBadge('licenseNumber')}
                >
                  <input
                    className={fieldInputClass(isUnresolved('licenseNumber'), 'bg-white')}
                    value={egrylForm.license.licenseNumber}
                    onChange={(e) => {
                      markManual('licenseNumber')
                      setEgrylForm((f) =>
                        f.license
                          ? {
                              ...f,
                              license: { ...f.license, licenseNumber: e.target.value },
                            }
                          : f,
                      )
                    }}
                  />
                </EgrylField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <EgrylField
                    label="Дата начала действия"
                    badge={getBadge('issueDate')}
                  >
                    <input
                      type="date"
                      className={fieldInputClass(isUnresolved('issueDate'), 'bg-white')}
                      value={egrylForm.license.issueDate}
                      onChange={(e) => {
                        markManual('issueDate')
                        setEgrylForm((f) =>
                          f.license
                            ? { ...f, license: { ...f.license, issueDate: e.target.value } }
                            : f,
                        )
                      }}
                    />
                  </EgrylField>
                  <label className="block text-sm">
                    <span className="text-slate-600 flex flex-wrap items-center gap-1">
                      Дата окончания действия
                      {getBadge('expiryDate') && (
                        <span className="text-xs font-normal text-slate-500">
                          {getBadge('expiryDate')}
                        </span>
                      )}
                      <ExpiryHint dateStr={egrylForm.license.expiryDate} />
                    </span>
                    <input
                      type="date"
                      className={`${fieldInputClass(isUnresolved('expiryDate'), 'bg-white')} ${
                        !isUnresolved('expiryDate') && licenseExpiryUrgent
                          ? 'border-orange-400 ring-1 ring-orange-200'
                          : !isUnresolved('expiryDate') &&
                              licenseExpiryDays !== null &&
                              licenseExpiryDays < 0
                            ? 'border-red-400 ring-1 ring-red-200'
                            : ''
                      }`}
                      value={egrylForm.license.expiryDate}
                      onChange={(e) => {
                        markManual('expiryDate')
                        setEgrylForm((f) =>
                          f.license
                            ? { ...f, license: { ...f.license, expiryDate: e.target.value } }
                            : f,
                        )
                      }}
                    />
                  </label>
                </div>
                <EgrylField
                  label="Вид деятельности"
                  badge={getBadge('licenseActivity')}
                >
                  <textarea
                    className={fieldInputClass(isUnresolved('licenseActivity'), 'bg-white')}
                    rows={2}
                    value={egrylForm.license.licenseActivity}
                    onChange={(e) => {
                      markManual('licenseActivity')
                      setEgrylForm((f) =>
                        f.license
                          ? { ...f, license: { ...f.license, licenseActivity: e.target.value } }
                          : f,
                      )
                    }}
                  />
                </EgrylField>
                <label className="block text-sm">
                  <span className="text-slate-600">Лицензирующий орган</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                    value={egrylForm.license.licenseAuthority}
                    onChange={(e) =>
                      setEgrylForm((f) =>
                        f.license
                          ? { ...f, license: { ...f.license, licenseAuthority: e.target.value } }
                          : f,
                      )
                    }
                  />
                </label>
              </fieldset>
            )}

            <button
              type="button"
              onClick={handleEgrylConfirm}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Применить реквизиты из ЕГРЮЛ
            </button>
          </div>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-slate-500">Ручной ввод ЕГРН без файла</summary>
        <div className="mt-2 space-y-2">
          <textarea
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={4}
            placeholder="Вставьте текст выписки ЕГРН..."
            onBlur={(e) => {
              if (e.target.value.trim()) {
                setEgrnForm({ ...EMPTY_EGRN, ...parseEGRNText(e.target.value) })
                setEgrnParsed(true)
              }
            }}
          />
        </div>
      </details>
    </div>
  )
}

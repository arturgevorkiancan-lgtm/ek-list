import { useCallback, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, Loader2 } from 'lucide-react'
import { parseLicenseFile } from '../lib/licenseParser'
import { saveLicenseFromParsed } from '../lib/api'
import type { DataSource } from '../lib/conflictDetector'
import {
  applyFieldToLicense,
  licenseToDataSource,
  mergedToLicenseForm,
} from '../lib/conflictMappers'
import { useDocumentConflicts } from '../hooks/useDocumentConflicts'
import { ConflictTable } from './ConflictTable'
import type { ParsedLicenseData } from '../types'

const EMPTY: ParsedLicenseData = {
  licenseNumber: '',
  inn: '',
  kpp: '',
  issueDate: '',
  expiryDate: '',
  licenseActivity: '',
  licenseStatus: '',
  branches: [],
  format: 'registry_table',
  rawText: '',
}

function fieldInputClass(unresolved: boolean) {
  return `mt-1 w-full rounded-md border px-3 py-2 text-sm ${
    unresolved ? 'border-red-500 ring-1 ring-red-200' : 'border-slate-300'
  }`
}

function LicenseField({
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

interface LicenseUploaderProps {
  clientId: string
  clientInn?: string | null
  existingLicenseId?: string
  onSaved: (message: string) => void
  parsedSources?: DataSource[]
  onParsedSourcesChange?: Dispatch<SetStateAction<DataSource[]>>
}

export function LicenseUploader({
  clientId,
  clientInn,
  existingLicenseId,
  onSaved,
  parsedSources: controlledSources,
  onParsedSourcesChange,
}: LicenseUploaderProps) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<ParsedLicenseData>(EMPTY)
  const [showForm, setShowForm] = useState(false)

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

  const onLicenseConflictResolve = useCallback(
    (fieldKey: string, value: string) => {
      handleConflictSelect(fieldKey, value)
      applyFieldToLicense(fieldKey, value, setForm)
    },
    [handleConflictSelect],
  )

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      setLoading(true)
      try {
        const result = await parseLicenseFile(file)
        const source = licenseToDataSource(result)
        addSource(source, (mergedData) =>
          setForm((prev) => mergedToLicenseForm(mergedData, { ...prev, ...result })),
        )
        setShowForm(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка парсинга')
      } finally {
        setLoading(false)
      }
    },
    [addSource],
  )

  const handleConfirm = async () => {
    setSaving(true)
    setError(null)
    try {
      const { branchCount } = await saveLicenseFromParsed(clientId, form, existingLicenseId)
      await qc.invalidateQueries({ queryKey: ['licenses', clientId] })
      await qc.invalidateQueries({ queryKey: ['client', clientId] })
      onSaved(
        branchCount > 0
          ? `Лицензия сохранена, ${branchCount} адрес(ов) подразделений`
          : 'Лицензия сохранена',
      )
      setShowForm(false)
      setForm(EMPTY)
      resetSources()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const innMismatch =
    clientInn &&
    form.inn &&
    clientInn.replace(/\D/g, '') !== form.inn.replace(/\D/g, '')

  type ScalarFieldKey =
    | 'licenseNumber'
    | 'inn'
    | 'kpp'
    | 'fullName'
    | 'legalAddress'
    | 'issueDate'
    | 'expiryDate'
    | 'licenseActivity'

  const scalarFields: Array<{
    key: ScalarFieldKey
    label: string
    type: string
    formKey: keyof ParsedLicenseData
  }> = [
    { key: 'licenseNumber', label: 'Номер лицензии', type: 'text', formKey: 'licenseNumber' },
    { key: 'inn', label: 'ИНН', type: 'text', formKey: 'inn' },
    { key: 'kpp', label: 'КПП', type: 'text', formKey: 'kpp' },
    { key: 'fullName', label: 'Наименование организации', type: 'text', formKey: 'fullName' },
    { key: 'legalAddress', label: 'Юридический адрес', type: 'text', formKey: 'legalAddress' },
    { key: 'issueDate', label: 'Дата начала действия', type: 'date', formKey: 'issueDate' },
    { key: 'expiryDate', label: 'Дата окончания действия', type: 'date', formKey: 'expiryDate' },
    { key: 'licenseActivity', label: 'Вид деятельности', type: 'text', formKey: 'licenseActivity' },
  ]

  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-4 space-y-3">
      <p className="text-sm font-medium text-slate-700">Импорт из файла лицензии</p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
        ) : (
          <Upload className="h-4 w-4 text-slate-500" />
        )}
        {loading ? 'Разбор документа…' : 'Загрузить .docx или .pdf'}
        <input
          type="file"
          accept=".docx,.pdf"
          className="hidden"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {showForm && (
        <div className="space-y-3 border-t border-slate-200 pt-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <FileText className="h-4 w-4" />
            Подтвердите данные лицензии
          </div>

          {innMismatch && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              ИНН в документе ({form.inn}) не совпадает с карточкой клиента ({clientInn})
            </p>
          )}

          {hasConflicts && (
            <ConflictTable
              conflicts={conflicts}
              onResolve={onLicenseConflictResolve}
              selectedByField={selectedByField}
              manualFieldKeys={manualOverrides}
              unresolvedFieldKeys={unresolvedFieldKeys}
            />
          )}

          {scalarFields.map(({ key, label, type, formKey }) => (
            <LicenseField key={key} label={label} badge={getBadge(key)}>
              {formKey === 'licenseActivity' ? (
                <textarea
                  className={fieldInputClass(isUnresolved(key))}
                  rows={2}
                  value={(form[formKey] as string) ?? ''}
                  onChange={(e) => {
                    markManual(key)
                    setForm((f) => ({ ...f, [formKey]: e.target.value }))
                  }}
                />
              ) : formKey === 'legalAddress' ? (
                <textarea
                  className={fieldInputClass(isUnresolved(key))}
                  rows={2}
                  value={(form[formKey] as string) ?? ''}
                  onChange={(e) => {
                    markManual(key)
                    setForm((f) => ({ ...f, [formKey]: e.target.value }))
                  }}
                />
              ) : (
                <input
                  type={type}
                  className={fieldInputClass(isUnresolved(key))}
                  value={(form[formKey] as string) ?? ''}
                  onChange={(e) => {
                    markManual(key)
                    setForm((f) => ({ ...f, [formKey]: e.target.value }))
                  }}
                />
              )}
            </LicenseField>
          ))}

          <label className="block text-sm">
            <span className="text-slate-600">Статус лицензии</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.licenseStatus}
              onChange={(e) => setForm((f) => ({ ...f, licenseStatus: e.target.value }))}
            />
          </label>

          <div className="space-y-2">
            <span className="text-sm text-slate-600">Адреса обособленных подразделений</span>
            {form.branches.map((branch, idx) => {
              const bKey = `branch:${branch.kpp}`
              return (
                <div
                  key={`${branch.kpp}-${idx}`}
                  className={`rounded-md border p-2 space-y-1 ${
                    isUnresolved(bKey) ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                  }`}
                >
                  <span className="text-xs font-medium text-slate-500">
                    КПП {branch.kpp}
                    {getBadge(bKey) && (
                      <span className="ml-2 font-normal">{getBadge(bKey)}</span>
                    )}
                  </span>
                  <textarea
                    className={fieldInputClass(isUnresolved(bKey))}
                    rows={2}
                    value={branch.address}
                    onChange={(e) => {
                      markManual(bKey)
                      setForm((f) => {
                        const branches = [...f.branches]
                        branches[idx] = { ...branches[idx], address: e.target.value }
                        return { ...f, branches }
                      })
                    }}
                  />
                </div>
              )
            })}
            {form.branches.length === 0 && (
              <p className="text-xs text-slate-400">Адреса подразделений не найдены в документе</p>
            )}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleConfirm()}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'Сохранение…' : 'Применить'}
          </button>
        </div>
      )}
    </div>
  )
}

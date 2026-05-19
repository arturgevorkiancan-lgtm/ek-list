import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, FileCheck, Loader2, X } from 'lucide-react'
import { parseApplicationPdf } from '../lib/applicationParser'
import {
  APPLICATION_TYPE_LABELS,
  APPLICATION_TYPE_TO_OPERATION,
  buildVerificationResults,
  summarizeVerification,
} from '../lib/applicationVerification'
import { applicationToDataSource } from '../lib/conflictMappers'
import type { DataSource } from '../lib/conflictDetector'
import {
  applyApplicationToClient,
  saveApplicationVerification,
} from '../lib/api'
import type {
  ApplicationVerificationSave,
  Checklist,
  Client,
  License,
  LicenseAddressJson,
  OperationType,
  ParsedApplicationData,
  VerificationResult,
} from '../types'

const STATUS_UI: Record<
  VerificationResult['status'],
  { label: string; rowClass: string; icon: string }
> = {
  ok: { label: 'OK', rowClass: 'bg-green-50', icon: '✅' },
  warning: { label: 'Расхождение', rowClass: 'bg-amber-50', icon: '⚠️' },
  error: { label: 'Ошибка', rowClass: 'bg-red-50', icon: '❌' },
  missing: { label: 'Нет в заявлении', rowClass: 'bg-slate-50', icon: '❓' },
}

interface ApplicationVerificationProps {
  clientId: string
  client: Client
  license: License | null
  branches: LicenseAddressJson[]
  checklists: Checklist[]
  onConflictSource?: (source: DataSource) => void
  onApplied?: () => void
  onSuggestChecklist?: (operation: OperationType) => void
}

export function ApplicationVerification({
  clientId,
  client,
  license,
  branches,
  checklists,
  onConflictSource,
  onApplied,
  onSuggestChecklist,
}: ApplicationVerificationProps) {
  const qc = useQueryClient()
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedApplicationData | null>(null)
  const [saving, setSaving] = useState(false)
  const [applied, setApplied] = useState(false)

  const results = useMemo(() => {
    if (!parsed) return []
    return buildVerificationResults(client, license, branches, parsed)
  }, [parsed, client, license, branches])

  const summary = useMemo(() => summarizeVerification(results), [results])

  const suggestedOperation = parsed
    ? APPLICATION_TYPE_TO_OPERATION[parsed.applicationType]
    : null

  const hasChecklistOfType =
    suggestedOperation &&
    checklists.some((c) => c.operation_type === suggestedOperation && c.status !== 'archived')

  const handleFile = async (file: File) => {
    setLoading(true)
    setError(null)
    setApplied(false)
    setFileName(file.name)
    setUploadedFile(file)
    try {
      const data = await parseApplicationPdf(file)
      setParsed(data)
      onConflictSource?.(applicationToDataSource(data))
    } catch (e) {
      setParsed(null)
      setFileName(null)
      setUploadedFile(null)
      setError(e instanceof Error ? e.message : 'Ошибка парсинга заявления')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveVerification = async () => {
    if (!parsed || !uploadedFile) return
    setSaving(true)
    try {
      const payload: ApplicationVerificationSave = {
        results,
        summary,
        applicationType: parsed.applicationType,
        parsedApplication: parsed,
      }
      await saveApplicationVerification(clientId, uploadedFile, payload)
      await qc.invalidateQueries({ queryKey: ['client-documents', clientId] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const handleApplyMissing = useCallback(async () => {
    if (!parsed) return
    setSaving(true)
    try {
      await applyApplicationToClient(clientId, parsed)
      setApplied(true)
      onApplied?.()
      await qc.invalidateQueries({ queryKey: ['client', clientId] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка применения данных')
    } finally {
      setSaving(false)
    }
  }, [parsed, clientId, onApplied, qc])

  const clear = () => {
    setParsed(null)
    setFileName(null)
    setUploadedFile(null)
    setError(null)
    setApplied(false)
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <SectionHeader />

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file) void handleFile(file)
        }}
        className="relative rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center"
      >
        {fileName && (
          <button
            type="button"
            onClick={clear}
            className="absolute top-2 right-2 rounded-full p-0.5 text-slate-400 hover:bg-slate-200"
            title="Очистить"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {loading ? (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" />
        ) : parsed ? (
          <>
            <Check className="mx-auto h-7 w-7 text-green-600" />
            <p className="mt-2 text-sm font-medium text-slate-700">{fileName}</p>
            <p className="text-xs text-slate-500 mt-1">
              Заявление № {parsed.applicationNumber || '—'} ·{' '}
              {APPLICATION_TYPE_LABELS[parsed.applicationType]}
            </p>
          </>
        ) : (
          <>
            <FileCheck className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm text-slate-600">PDF</p>
            <label className="mt-2 inline-block cursor-pointer text-sm font-medium text-brand-600 hover:underline">
              Заявление с Госуслуг
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                  e.target.value = ''
                }}
              />
            </label>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {parsed && results.length > 0 && (
        <>
          <p className="text-sm text-slate-600">
            Проверено {summary.total} полей: {summary.ok} совпадают, {summary.warnings}{' '}
            расхождений, {summary.errors} ошибок
            {summary.missing > 0 ? `, ${summary.missing} отсутствуют в заявлении` : ''}
          </p>

          <VerificationTable results={results} />

          <ActionButtons
            saving={saving}
            applied={applied}
            onSave={() => void handleSaveVerification()}
            onApply={() => void handleApplyMissing()}
          />
        </>
      )}

      {parsed && suggestedOperation && !hasChecklistOfType && onSuggestChecklist && (
        <SuggestChecklistBanner
          typeLabel={APPLICATION_TYPE_LABELS[parsed.applicationType]}
          onCreate={() => onSuggestChecklist(suggestedOperation)}
        />
      )}
    </section>
  )
}

function SectionHeader() {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">Сверка заявления</h3>
      <p className="text-xs text-slate-500 mt-0.5">
        Загрузите заполненное заявление с Госуслуг для проверки
      </p>
    </div>
  )
}

function VerificationTable({ results }: { results: VerificationResult[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-600">
            <th className="px-3 py-2">Поле</th>
            <th className="px-3 py-2">Наши данные</th>
            <th className="px-3 py-2">В заявлении</th>
            <th className="px-3 py-2 w-28">Статус</th>
          </tr>
        </thead>
        <tbody>
          {results.map((row) => {
            const ui = STATUS_UI[row.status]
            return (
              <tr key={row.fieldKey} className={`border-b border-slate-50 ${ui.rowClass}`}>
                <td className="px-3 py-2 font-medium text-slate-800">{row.field}</td>
                <td className="px-3 py-2 text-slate-700 break-words max-w-[200px]">
                  {row.ourValue || '—'}
                </td>
                <td className="px-3 py-2 text-slate-700 break-words max-w-[200px]">
                  {row.applicationValue || '—'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs">
                  {ui.icon} {ui.label}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ActionButtons({
  saving,
  applied,
  onSave,
  onApply,
}: {
  saving: boolean
  applied: boolean
  onSave: () => void
  onApply: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={saving}
        onClick={onSave}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
      >
        {saving ? 'Сохранение…' : 'Сохранить результат сверки'}
      </button>
      <button
        type="button"
        disabled={saving || applied}
        onClick={onApply}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {applied ? 'Данные применены' : 'Заполнить пустые поля из заявления'}
      </button>
    </div>
  )
}

function SuggestChecklistBanner({
  typeLabel,
  onCreate,
}: {
  typeLabel: string
  onCreate: () => void
}) {
  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 flex flex-wrap items-center justify-between gap-2">
      <span>Обнаружено заявление на {typeLabel}. Создать чеклист?</span>
      <button
        type="button"
        onClick={onCreate}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-white text-sm font-medium hover:bg-brand-700"
      >
        Создать
      </button>
    </div>
  )
}

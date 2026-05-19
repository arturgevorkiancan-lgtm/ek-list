import { useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import { CheckCircle, FileText, Loader2, Upload } from 'lucide-react'
import { parseEgrylUploadFile } from '../lib/parseEgrylFile'
import {
  formatEgrylChangeLabels,
  getEgrylRequisiteChanges,
  parsedEgrylToRequisites,
  type ClientRequisitesSnapshot,
} from '../lib/egrylRequisites'
import { uploadClientDocument, upsertClient } from '../lib/api'
import type { Document } from '../types'

interface OrganizationEgrylBlockProps {
  clientId: string
  client: ClientRequisitesSnapshot
  clientDocs: Document[]
  onRefetchDocs: () => void
  onRequisitesUpdated?: (patch: Partial<ClientRequisitesSnapshot>) => void
  onClientRefetch?: () => void
}

export function OrganizationEgrylBlock({
  clientId,
  client,
  clientDocs,
  onRefetchDocs,
  onRequisitesUpdated,
  onClientRefetch,
}: OrganizationEgrylBlockProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const latestEgryl = useMemo(() => {
    return clientDocs
      .filter((d) => d.doc_type === 'egryl' && !d.warehouse_id)
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0]
  }, [clientDocs])

  const handleFile = async (file: File) => {
    setError(null)
    setLoading(true)
    try {
      const result = await parseEgrylUploadFile(file)
      await uploadClientDocument(clientId, file, 'egryl', {
        client: result.client,
        license: result.license,
      })
      onRefetchDocs()

      const changedKeys = getEgrylRequisiteChanges(client, result.client)
      if (changedKeys.length > 0) {
        const labels = formatEgrylChangeLabels(changedKeys)
        const ok = window.confirm(
          `В выписке изменились: ${labels}.\n\nОбновить реквизиты клиента?`,
        )
        if (ok) {
          const patch = parsedEgrylToRequisites(result.client)
          await upsertClient({
            id: clientId,
            name: patch.name || client.name,
            inn: patch.inn ?? client.inn,
            kpp: patch.kpp ?? client.kpp,
            ogrn: patch.ogrn ?? client.ogrn,
            legal_address: patch.legal_address ?? client.legal_address,
          })
          onRequisitesUpdated?.(patch)
          onClientRefetch?.()
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка парсинга')
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <FileText className="h-4 w-4 text-brand-600" />
        Документы организации
      </h3>

      {latestEgryl ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
          <span>
            ЕГРЮЛ загружен:{' '}
            {format(parseISO(latestEgryl.uploaded_at), 'dd.MM.yyyy', { locale: ru })}
          </span>
          <button
            type="button"
            disabled={loading}
            onClick={() => inputRef.current?.click()}
            className="text-brand-600 hover:underline disabled:opacity-50"
          >
            обновить
          </button>
        </div>
      ) : null}

      <div>
        <button
          type="button"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          <FileText className="h-4 w-4" />
          Загрузить выписку ЕГРЮЛ
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.xml"
          className="hidden"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

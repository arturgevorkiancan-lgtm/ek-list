import { useEffect, useRef, useState } from 'react'
import { FileText, Loader2, Upload, X } from 'lucide-react'
import { parseEgrylUploadFile } from '../lib/parseEgrylFile'
import { parsedEgrylToRequisites } from '../lib/egrylRequisites'

export interface NewClientFormState {
  name: string
  inn: string
  kpp: string
  ogrn: string
  legal_address: string
  phone: string
  email: string
}

const EMPTY_FORM: NewClientFormState = {
  name: '',
  inn: '',
  kpp: '',
  ogrn: '',
  legal_address: '',
  phone: '',
  email: '',
}

function validateInn(inn: string, required: boolean): string | null {
  const digits = inn.replace(/\D/g, '')
  if (!digits) return required ? 'Укажите ИНН' : null
  if (digits.length !== 10 && digits.length !== 12) return 'ИНН должен содержать 10 или 12 цифр'
  return null
}

function validateKpp(kpp: string): string | null {
  const digits = kpp.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length !== 9) return 'КПП должен содержать 9 цифр'
  return null
}

function validateOgrn(ogrn: string): string | null {
  const digits = ogrn.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length !== 13 && digits.length !== 15) return 'ОГРН должен содержать 13 или 15 цифр'
  return null
}

interface NewClientModalProps {
  open: boolean
  saving?: boolean
  onClose: () => void
  onCreate: (data: NewClientFormState) => void | Promise<void>
}

export function NewClientModal({
  open,
  saving = false,
  onClose,
  onCreate,
}: NewClientModalProps) {
  const [form, setForm] = useState<NewClientFormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof NewClientFormState, string>>>({})
  const egrylInputRef = useRef<HTMLInputElement>(null)
  const [egrylLoading, setEgrylLoading] = useState(false)
  const [egrylError, setEgrylError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM)
      setErrors({})
      setEgrylError(null)
      setEgrylLoading(false)
    }
  }, [open])

  const handleEgrylFile = async (file: File) => {
    setEgrylError(null)
    setEgrylLoading(true)
    try {
      const result = await parseEgrylUploadFile(file)
      const patch = parsedEgrylToRequisites(result.client)
      setForm((f) => ({
        ...f,
        name: patch.name || f.name,
        inn: patch.inn ?? f.inn,
        kpp: patch.kpp ?? f.kpp,
        ogrn: patch.ogrn ?? f.ogrn,
        legal_address: patch.legal_address ?? f.legal_address,
      }))
      setErrors({})
    } catch (e) {
      setEgrylError(e instanceof Error ? e.message : 'Ошибка парсинга')
    } finally {
      setEgrylLoading(false)
      if (egrylInputRef.current) egrylInputRef.current.value = ''
    }
  }

  useEffect(() => {
    if (!open) return
    const onEsc = () => onClose()
    window.addEventListener('checklist:escape', onEsc)
    return () => window.removeEventListener('checklist:escape', onEsc)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const nextErrors: Partial<Record<keyof NewClientFormState, string>> = {}
    if (!form.name.trim()) nextErrors.name = 'Укажите название организации'
    const innErr = validateInn(form.inn, true)
    if (innErr) nextErrors.inn = innErr
    const kppErr = validateKpp(form.kpp)
    if (kppErr) nextErrors.kpp = kppErr
    const ogrnErr = validateOgrn(form.ogrn)
    if (ogrnErr) nextErrors.ogrn = ogrnErr
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Некорректный email'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    void onCreate(form)
  }

  const field = (
    key: keyof NewClientFormState,
    label: string,
    opts?: { required?: boolean; type?: string },
  ) => (
    <label className="block text-sm">
      <span className="text-slate-600">
        {label}
        {opts?.required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type={opts?.type ?? 'text'}
        className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
          errors[key] ? 'border-red-400' : 'border-slate-300'
        }`}
        value={form[key]}
        onChange={(e) => {
          setForm((f) => ({ ...f, [key]: e.target.value }))
          if (errors[key]) setErrors((err) => ({ ...err, [key]: undefined }))
        }}
      />
      {errors[key] && <p className="mt-0.5 text-xs text-red-600">{errors[key]}</p>}
    </label>
  )

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Новый клиент</h3>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-slate-100"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5 text-slate-400" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        {field('name', 'Название организации', { required: true })}
        {field('inn', 'ИНН', { required: true })}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
          <p className="text-sm text-slate-600">Или загрузите выписку ЕГРЮЛ</p>
          <button
            type="button"
            disabled={egrylLoading || saving}
            onClick={() => egrylInputRef.current?.click()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-white px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            {egrylLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            <FileText className="h-4 w-4" />
            Загрузить выписку ЕГРЮЛ
          </button>
          <input
            ref={egrylInputRef}
            type="file"
            accept=".pdf,.xml"
            className="hidden"
            disabled={egrylLoading || saving}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleEgrylFile(f)
            }}
          />
          <p className="text-xs text-slate-500">Поддерживаются форматы PDF и XML</p>
          <p className="text-xs text-slate-500">Данные заполнятся автоматически</p>
          {egrylError && <p className="text-xs text-red-600">{egrylError}</p>}
        </div>

        {field('kpp', 'КПП')}
        {field('ogrn', 'ОГРН')}
        {field('legal_address', 'Адрес')}
        {field('phone', 'Телефон')}
        {field('email', 'Email', { type: 'email' })}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 min-h-[44px] rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'Создание…' : 'Создать'}
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
    </ModalOverlay>
  )
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

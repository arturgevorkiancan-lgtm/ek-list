import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Client } from '../types'

export interface EditClientFormState {
  name: string
  inn: string
  kpp: string
  ogrn: string
  contact_person: string
  phone: string
  email: string
}

function clientToForm(client: Client): EditClientFormState {
  return {
    name: client.name ?? '',
    inn: client.inn ?? '',
    kpp: client.kpp ?? '',
    ogrn: client.ogrn ?? '',
    contact_person: client.contact_person ?? '',
    phone: client.phone ?? '',
    email: client.email ?? '',
  }
}

function validateInn(inn: string): string | null {
  const digits = inn.replace(/\D/g, '')
  if (!digits) return null
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

interface EditClientModalProps {
  open: boolean
  client: Client | null
  saving?: boolean
  onClose: () => void
  onSave: (data: EditClientFormState) => void | Promise<void>
}

export function EditClientModal({
  open,
  client,
  saving = false,
  onClose,
  onSave,
}: EditClientModalProps) {
  const [form, setForm] = useState<EditClientFormState>({
    name: '',
    inn: '',
    kpp: '',
    ogrn: '',
    contact_person: '',
    phone: '',
    email: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof EditClientFormState, string>>>({})

  useEffect(() => {
    if (client && open) {
      setForm(clientToForm(client))
      setErrors({})
    }
  }, [client, open])

  useEffect(() => {
    if (!open) return
    const onEsc = () => onClose()
    window.addEventListener('checklist:escape', onEsc)
    return () => window.removeEventListener('checklist:escape', onEsc)
  }, [open, onClose])

  if (!open || !client) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const nextErrors: Partial<Record<keyof EditClientFormState, string>> = {}
    if (!form.name.trim()) nextErrors.name = 'Укажите название организации'
    const innErr = validateInn(form.inn)
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
    void onSave(form)
  }

  const field = (
    key: keyof EditClientFormState,
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
        <h3 className="font-semibold text-slate-900">Редактировать клиента</h3>
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
        {field('inn', 'ИНН')}
        {field('kpp', 'КПП')}
        {field('ogrn', 'ОГРН')}
        {field('contact_person', 'Контактное лицо')}
        {field('phone', 'Телефон')}
        {field('email', 'Email', { type: 'email' })}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 min-h-[44px] rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
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

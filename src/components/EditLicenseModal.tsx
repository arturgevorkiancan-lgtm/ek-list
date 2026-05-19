import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { License, LicenseAddressJson } from '../types'

export const LICENSE_TYPE_OPTIONS = [
  'Закупка, хранение и поставки алкогольной продукции',
  'Розничная продажа алкогольной продукции',
  'Производство алкогольной продукции',
  'Хранение алкогольной продукции',
] as const

export interface EditLicenseFormState {
  license_number: string
  issue_date: string
  expiry_date: string
  license_type: string
  addressesText: string
}

function licenseToForm(license: License | null): EditLicenseFormState {
  if (!license) {
    return {
      license_number: '',
      issue_date: '',
      expiry_date: '',
      license_type: '',
      addressesText: '',
    }
  }
  const addresses = (license.addresses ?? [])
    .map((a) => a.address?.trim())
    .filter(Boolean)
  return {
    license_number: license.license_number ?? '',
    issue_date: license.issue_date ?? '',
    expiry_date: license.expiry_date ?? '',
    license_type: license.license_activity ?? license.license_type ?? '',
    addressesText: addresses.join('\n'),
  }
}

function addressesFromText(text: string): LicenseAddressJson[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((address) => ({ address }))
}

interface EditLicenseModalProps {
  open: boolean
  license: License | null
  saving?: boolean
  onClose: () => void
  onSave: (data: EditLicenseFormState) => void | Promise<void>
}

export function EditLicenseModal({
  open,
  license,
  saving = false,
  onClose,
  onSave,
}: EditLicenseModalProps) {
  const [form, setForm] = useState<EditLicenseFormState>(licenseToForm(null))
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})

  useEffect(() => {
    if (open) {
      setForm(licenseToForm(license))
      setErrors({})
    }
  }, [license, open])

  useEffect(() => {
    if (!open) return
    const onEsc = () => onClose()
    window.addEventListener('checklist:escape', onEsc)
    return () => window.removeEventListener('checklist:escape', onEsc)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const nextErrors: Partial<Record<string, string>> = {}
    if (!form.license_number.trim()) nextErrors.license_number = 'Укажите номер лицензии'
    if (!form.expiry_date.trim()) nextErrors.expiry_date = 'Укажите дату окончания'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    void onSave(form)
  }

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

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-slate-600">
              Номер лицензии <span className="text-red-500">*</span>
            </span>
            <input
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                errors.license_number ? 'border-red-400' : 'border-slate-300'
              }`}
              value={form.license_number}
              onChange={(e) => {
                setForm((f) => ({ ...f, license_number: e.target.value }))
                if (errors.license_number) setErrors((err) => ({ ...err, license_number: undefined }))
              }}
            />
            {errors.license_number && (
              <p className="mt-0.5 text-xs text-red-600">{errors.license_number}</p>
            )}
          </label>

          <label className="block text-sm">
            <span className="text-slate-600">Дата выдачи</span>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.issue_date}
              onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))}
            />
          </label>

          <label className="block text-sm">
            <span className="text-slate-600">
              Дата окончания <span className="text-red-500">*</span>
            </span>
            <input
              type="date"
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                errors.expiry_date ? 'border-red-400' : 'border-slate-300'
              }`}
              value={form.expiry_date}
              onChange={(e) => {
                setForm((f) => ({ ...f, expiry_date: e.target.value }))
                if (errors.expiry_date) setErrors((err) => ({ ...err, expiry_date: undefined }))
              }}
            />
            {errors.expiry_date && (
              <p className="mt-0.5 text-xs text-red-600">{errors.expiry_date}</p>
            )}
          </label>

          <label className="block text-sm">
            <span className="text-slate-600">Тип лицензии</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.license_type}
              onChange={(e) => setForm((f) => ({ ...f, license_type: e.target.value }))}
            >
              <option value="">— выберите —</option>
              {LICENSE_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-slate-600">Адреса (по одному на строку)</span>
            <textarea
              rows={4}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.addressesText}
              onChange={(e) => setForm((f) => ({ ...f, addressesText: e.target.value }))}
              placeholder="г. Москва, ул. Примерная, д. 1"
            />
          </label>

          <ModalFormActions saving={saving} onClose={onClose} />
        </form>
      </div>
    </div>
  )
}

function ModalFormActions({
  saving,
  onClose,
}: {
  saving: boolean
  onClose: () => void
}) {
  return (
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
  )
}

export { addressesFromText }

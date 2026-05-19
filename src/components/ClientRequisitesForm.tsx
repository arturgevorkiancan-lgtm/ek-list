import type { Dispatch, SetStateAction } from 'react'

export const REISSUE_REASON_OPTIONS = [
  'Изменение наименования организации',
  'Изменение места нахождения (юридического адреса)',
  'Изменение адреса места осуществления деятельности',
  'Реорганизация юридического лица',
  'Иное',
] as const

export interface ClientRequisitesFormState {
  name: string
  short_name: string
  inn: string
  kpp: string
  ogrn: string
  legal_address: string
  director_last_name: string
  director_first_name: string
  director_middle_name: string
  director_phone: string
  representative_name: string
  representative_poa: string
  alcohol_over_15_pct: boolean
  phone: string
  email: string
}

export interface LicenseExtendedFormState {
  license_number: string
  issue_date: string
  expiry_date: string
  license_type: string
  renewal_years: number
  payment_order_number: string
  payment_order_date: string
  reissue_reason: string
  reissue_description: string
}

interface ClientRequisitesFormProps {
  form: ClientRequisitesFormState
  setForm: Dispatch<SetStateAction<ClientRequisitesFormState>>
  requisitesEmpty?: boolean
  saving?: boolean
  onSave?: () => void
  compact?: boolean
}

export function ClientRequisitesForm({
  form,
  setForm,
  requisitesEmpty,
  saving,
  onSave,
  compact,
}: ClientRequisitesFormProps) {
  return (
    <div className={compact ? 'space-y-4' : 'rounded-xl border border-slate-200 bg-white p-5 space-y-5'}>
      {requisitesEmpty && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
          💡 Загрузите ЕГРЮЛ на вкладке «Документы» для автозаполнения
        </p>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-1 w-full">
          Реквизиты организации
        </legend>
        <label className="block text-sm">
          <span className="text-slate-600">Полное наименование</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Краткое наименование</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.short_name}
            onChange={(e) => setForm((f) => ({ ...f, short_name: e.target.value }))}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          {(['ogrn', 'inn', 'kpp'] as const).map((key) => (
            <label key={key} className="block text-sm">
              <span className="text-slate-600">{key.toUpperCase()}</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <label className="block text-sm">
          <span className="text-slate-600">Юридический адрес</span>
          <textarea
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={2}
            value={form.legal_address}
            onChange={(e) => setForm((f) => ({ ...f, legal_address: e.target.value }))}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-600">Email</span>
            <input
              type="email"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Телефон</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-1 w-full">
          Руководитель
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ['director_last_name', 'Фамилия'],
              ['director_first_name', 'Имя'],
              ['director_middle_name', 'Отчество'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="text-slate-600">{label}</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <label className="block text-sm">
          <span className="text-slate-600">Телефон руководителя</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.director_phone}
            onChange={(e) => setForm((f) => ({ ...f, director_phone: e.target.value }))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.alcohol_over_15_pct}
            onChange={(e) => setForm((f) => ({ ...f, alcohol_over_15_pct: e.target.checked }))}
            className="rounded border-slate-300"
          />
          <span className="text-slate-600">Оборот АП &gt;15% объёма</span>
        </label>
      </fieldset>

      <details className="text-sm" open={!!(form.representative_name || form.representative_poa)}>
        <summary className="cursor-pointer font-semibold text-slate-800">Представитель</summary>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-slate-600">ФИО представителя</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.representative_name}
              onChange={(e) => setForm((f) => ({ ...f, representative_name: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-slate-600">Реквизиты доверенности (номер и дата)</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.representative_poa}
              onChange={(e) => setForm((f) => ({ ...f, representative_poa: e.target.value }))}
            />
          </label>
        </div>
      </details>

      {onSave && (
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      )}
    </div>
  )
}

interface LicenseOperationFieldsProps {
  operationType: 'ПРОДЛЕНИЕ' | 'ПЕРЕОФОРМЛЕНИЕ' | null
  form: LicenseExtendedFormState
  setForm: Dispatch<SetStateAction<LicenseExtendedFormState>>
}

export function LicenseOperationFields({
  operationType,
  form,
  setForm,
}: LicenseOperationFieldsProps) {
  if (!operationType) return null

  if (operationType === 'ПРОДЛЕНИЕ') {
    return (
      <div className="grid gap-3 sm:grid-cols-3 border-t border-slate-100 pt-3">
        <label className="block text-sm">
          <span className="text-slate-600">Номер платёжного поручения</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.payment_order_number}
            onChange={(e) => setForm((f) => ({ ...f, payment_order_number: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Дата платёжного поручения</span>
          <input
            type="date"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.payment_order_date}
            onChange={(e) => setForm((f) => ({ ...f, payment_order_date: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Срок продления (лет)</span>
          <input
            type="number"
            min={1}
            max={10}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.renewal_years}
            onChange={(e) =>
              setForm((f) => ({ ...f, renewal_years: Number(e.target.value) || 5 }))
            }
          />
        </label>
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      <label className="block text-sm">
        <span className="text-slate-600">Причина переоформления</span>
        <select
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={form.reissue_reason}
          onChange={(e) => setForm((f) => ({ ...f, reissue_reason: e.target.value }))}
        >
          <option value="">—</option>
          {REISSUE_REASON_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Описание причины</span>
        <textarea
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          rows={2}
          value={form.reissue_description}
          onChange={(e) => setForm((f) => ({ ...f, reissue_description: e.target.value }))}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-slate-600">Номер платёжного поручения</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.payment_order_number}
            onChange={(e) => setForm((f) => ({ ...f, payment_order_number: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Дата платёжного поручения</span>
          <input
            type="date"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.payment_order_date}
            onChange={(e) => setForm((f) => ({ ...f, payment_order_date: e.target.value }))}
          />
        </label>
      </div>
    </div>
  )
}

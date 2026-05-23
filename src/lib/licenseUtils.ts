import { differenceInDays, parseISO, isValid } from 'date-fns'
import type { License, LicenseExpiryStatus } from '../types'

export function getLicenseExpiryStatus(license: License | null | undefined): LicenseExpiryStatus {
  if (!license?.expiry_date) return 'none'
  const expiry = parseISO(license.expiry_date)
  if (!isValid(expiry)) return 'none'

  const daysLeft = differenceInDays(expiry, new Date())
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= 30) return 'warning_30d'
  if (daysLeft <= 90) return 'warning_90d'
  return 'ok'
}

export const EXPIRY_COLORS: Record<LicenseExpiryStatus, string> = {
  expired: 'border-l-red-500 bg-red-50',
  warning_30d: 'border-l-orange-600 bg-orange-50',
  warning_90d: 'border-l-amber-400 bg-amber-50',
  ok: 'border-l-emerald-500 bg-white',
  none: 'border-l-slate-300 bg-white',
}

export const EXPIRY_DOT: Record<LicenseExpiryStatus, string> = {
  expired: 'bg-red-500',
  warning_30d: 'bg-orange-600',
  warning_90d: 'bg-amber-400',
  ok: 'bg-emerald-500',
  none: 'bg-slate-400',
}

export const EXPIRY_LABEL: Record<LicenseExpiryStatus, string> = {
  expired: 'Просрочено',
  warning_30d: 'ВНИМАНИЕ',
  warning_90d: 'Скоро истекает',
  ok: '',
  none: 'Нет лицензии',
}

/** Классы подписи статуса на карточке клиента (ClientsPage). */
export const EXPIRY_LABEL_CLASS: Record<LicenseExpiryStatus, string> = {
  expired: 'text-red-600 font-medium',
  warning_30d:
    'inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700',
  warning_90d: 'text-amber-700 font-medium',
  ok: '',
  none: 'text-slate-400',
}

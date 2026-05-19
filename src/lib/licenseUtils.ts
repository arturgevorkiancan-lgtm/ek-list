import { differenceInDays, parseISO, isValid } from 'date-fns'
import type { License, LicenseExpiryStatus } from '../types'

export function getLicenseExpiryStatus(license: License | null | undefined): LicenseExpiryStatus {
  if (!license?.expiry_date) return 'none'
  const expiry = parseISO(license.expiry_date)
  if (!isValid(expiry)) return 'none'

  const daysLeft = differenceInDays(expiry, new Date())
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= 30) return 'expired'
  if (daysLeft <= 95) return 'warning_95d'
  if (daysLeft <= 180) return 'warning_6m'
  return 'ok'
}

export const EXPIRY_COLORS: Record<LicenseExpiryStatus, string> = {
  expired: 'border-l-red-500 bg-red-50',
  warning_95d: 'border-l-orange-500 bg-orange-50',
  warning_6m: 'border-l-amber-400 bg-amber-50',
  ok: 'border-l-emerald-500 bg-white',
  none: 'border-l-slate-300 bg-white',
}

export const EXPIRY_DOT: Record<LicenseExpiryStatus, string> = {
  expired: 'bg-red-500',
  warning_95d: 'bg-orange-500',
  warning_6m: 'bg-amber-400',
  ok: 'bg-emerald-500',
  none: 'bg-slate-400',
}

export const EXPIRY_LABEL: Record<LicenseExpiryStatus, string> = {
  expired: 'Просрочено',
  warning_95d: 'Подать заявку',
  warning_6m: 'Скоро продление',
  ok: 'В порядке',
  none: 'Нет лицензии',
}

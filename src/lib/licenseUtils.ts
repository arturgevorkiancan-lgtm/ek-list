import { differenceInDays, parseISO, isValid } from 'date-fns'
import type { License, LicenseExpiryStatus } from '../types'

const ACTIVE_LICENSE_STATUSES = new Set(['действующая', 'приостановлена'])

export function isActiveLicense(license: License): boolean {
  const status = license.license_status?.toLowerCase().trim()
  if (!status) return true
  if (status === 'аннулирована' || status === 'аннулирован') return false
  return ACTIVE_LICENSE_STATUSES.has(status) || !license.license_status
}

/** Лицензии клиента с датой окончания, от ближайшей к дальней. */
export function getLicensesByNearestExpiry(licenses: License[]): License[] {
  return [...licenses]
    .filter((l) => l.expiry_date && isValid(parseISO(l.expiry_date)))
    .sort((a, b) => (a.expiry_date ?? '').localeCompare(b.expiry_date ?? ''))
}

/** Ближайшая по сроку лицензия — для карточки клиента и статуса. */
export function getNearestExpiringLicense(licenses: License[]): License | null {
  const withExpiry = getLicensesByNearestExpiry(licenses)
  if (withExpiry.length === 0) return licenses[0] ?? null

  const active = withExpiry.filter(isActiveLicense)
  return active[0] ?? withExpiry[0]
}

export function getClientLicenseExpiryStatus(licenses: License[]): LicenseExpiryStatus {
  return getLicenseExpiryStatus(getNearestExpiringLicense(licenses))
}

export function nearestExpiryDays(licenses: License[]): number | null {
  const nearest = getNearestExpiringLicense(licenses)
  if (!nearest?.expiry_date || !isValid(parseISO(nearest.expiry_date))) return null
  return differenceInDays(parseISO(nearest.expiry_date), new Date())
}

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

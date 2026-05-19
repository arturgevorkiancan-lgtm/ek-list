import { useCallback, useMemo, useState } from 'react'
import { differenceInDays, parseISO, isValid } from 'date-fns'
import type { Client, License, NotificationBanner } from '../types'

const DISMISSED_KEY = 'ek_dismissed_notifications'

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return new Set(JSON.parse(raw ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
}

export function useNotifications(
  clients: Client[],
  licenses: License[],
): {
  banners: NotificationBanner[]
  count: number
  dismissBanner: (id: string) => void
} {
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed())

  const dismissBanner = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveDismissed(next)
      return next
    })
  }, [])

  return useMemo(() => {
    const banners: NotificationBanner[] = []
    const clientMap = new Map(clients.map((c) => [c.id, c.name]))

    for (const license of licenses) {
      if (!license.expiry_date) continue
      const expiry = parseISO(license.expiry_date)
      if (!isValid(expiry)) continue

      const daysLeft = differenceInDays(expiry, new Date())
      const clientName = clientMap.get(license.client_id) ?? 'Клиент'

      if (daysLeft < 0 || daysLeft <= 30) {
        banners.push({
          id: `critical-${license.id}`,
          type: 'critical',
          message: `Лицензия истекает через ${daysLeft} дн. — срочно продлите`,
          clientId: license.client_id,
          clientName,
        })
      } else if (daysLeft <= 95) {
        banners.push({
          id: `app-${license.id}`,
          type: 'application',
          message: 'Необходимо подать заявку на продление (осталось ≤95 дней)',
          clientId: license.client_id,
          clientName,
        })
      } else if (daysLeft <= 180) {
        banners.push({
          id: `renew-${license.id}`,
          type: 'renewal',
          message: 'Скоро продление лицензии (осталось ≤6 месяцев)',
          clientId: license.client_id,
          clientName,
        })
      }
    }

    const unique = banners.filter(
      (b, i, arr) => arr.findIndex((x) => x.clientId === b.clientId && x.type === b.type) === i,
    )

    const visible = unique.filter((b) => !dismissed.has(b.id))

    return { banners: visible, count: visible.length, dismissBanner }
  }, [clients, licenses, dismissed, dismissBanner])
}

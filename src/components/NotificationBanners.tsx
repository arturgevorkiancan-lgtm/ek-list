import { Link } from 'react-router-dom'
import { AlertTriangle, FileWarning, Clock, X } from 'lucide-react'
import type { NotificationBanner } from '../types'

const STYLES = {
  critical: 'bg-red-50 border-red-200 text-red-900',
  application: 'bg-orange-50 border-orange-200 text-orange-900',
  renewal: 'bg-amber-50 border-amber-200 text-amber-900',
}

const ICONS = {
  critical: AlertTriangle,
  application: FileWarning,
  renewal: Clock,
}

interface NotificationBannersProps {
  banners: NotificationBanner[]
  onDismiss?: (id: string) => void
}

export function NotificationBanners({ banners, onDismiss }: NotificationBannersProps) {
  if (banners.length === 0) return null

  return (
    <div className="space-y-2 mb-6">
      {banners.slice(0, 5).map((banner) => {
        const Icon = ICONS[banner.type]
        return (
          <div
            key={banner.id}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${STYLES[banner.type]}`}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <Link to={`/clients/${banner.clientId}`} className="font-medium hover:underline">
                {banner.clientName}
              </Link>
              <span className="mx-1">—</span>
              <span>{banner.message}</span>
            </div>
            {onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(banner.id)}
                className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
                aria-label="Скрыть уведомление"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

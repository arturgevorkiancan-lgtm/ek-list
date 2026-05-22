import { classifyLicense } from '../lib/licenseRegistry'

export const LICENSE_BADGE_COLOR_CLASSES: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
  gray: 'bg-gray-100 text-gray-600',
  orange: 'bg-orange-100 text-orange-800',
}

const KNOWN_LABEL_COLORS: Record<string, string> = {
  'ЗХП АЛКО': 'blue',
  'РОЗНИЦА АЛКО': 'blue',
  'РОЗНИЦА ОБЩЕПИТ': 'blue',
  'ПРОИЗВ АЛКО': 'blue',
  'ЗХП СПИРТ-ПИЩ': 'purple',
  'ПРОИЗВ СПИРТ-ПИЩ': 'purple',
  'ЗХП СПИРТ-НЕПИЩ': 'gray',
  'ПРОИЗВ СПИРТ-НЕПИЩ': 'gray',
  'ЭТИЛ СПИРТ': 'orange',
  'ИНОЕ': 'gray',
}

function resolveBadge(type: string): { label: string; color: string } {
  const trimmed = type.trim()
  if (!trimmed) return { label: '—', color: 'gray' }
  const knownColor = KNOWN_LABEL_COLORS[trimmed.toUpperCase()]
  if (knownColor) return { label: trimmed, color: knownColor }
  const classified = classifyLicense(trimmed)
  return { label: classified.label, color: classified.color }
}

function normalizeTypes(licenseType: string | string[] | null | undefined): string[] {
  if (licenseType == null) return []
  const raw = Array.isArray(licenseType) ? licenseType : [licenseType]
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of raw) {
    const s = t?.trim()
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

export function LicenseTypeBadge({
  licenseType,
  className = '',
}: {
  licenseType: string | string[] | null | undefined
  className?: string
}) {
  const types = normalizeTypes(licenseType)
  if (types.length === 0) return null

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {types.map((type) => {
        const { label, color } = resolveBadge(type)
        const colorClass = LICENSE_BADGE_COLOR_CLASSES[color] ?? LICENSE_BADGE_COLOR_CLASSES.gray
        return (
          <span
            key={label}
            className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${colorClass}`}
          >
            {label}
          </span>
        )
      })}
    </span>
  )
}

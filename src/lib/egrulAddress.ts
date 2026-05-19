/** Признаки описательного текста ЕГРЮЛ вместо почтового адреса. */
export const EGRUL_LEGAL_ADDRESS_BOILERPLATE = [
  'постоянного места жительства',
  'преимущественного пребывания',
  'юридического лица',
  'органа государственной власти',
] as const

const MAX_EGRUL_LEGAL_ADDRESS_LEN = 280

export function isEgrulLegalAddressBoilerplate(text: string): boolean {
  const lower = text.toLowerCase()
  return EGRUL_LEGAL_ADDRESS_BOILERPLATE.some((phrase) => lower.includes(phrase))
}

/** Короткий юридический адрес из ЕГРЮЛ; пустая строка, если это только описание из выписки. */
export function sanitizeEgrulLegalAddress(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''

  if (!isEgrulLegalAddressBoilerplate(trimmed)) {
    return trimmed.length > MAX_EGRUL_LEGAL_ADDRESS_LEN ? '' : trimmed
  }

  const postalMatch = trimmed.match(/\d{6},\s*[\s\S]+/)
  if (postalMatch) {
    const candidate = postalMatch[0]
      .replace(/\s+\d+\s+ГРН[\s\S]*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (
      candidate &&
      !isEgrulLegalAddressBoilerplate(candidate) &&
      candidate.length <= MAX_EGRUL_LEGAL_ADDRESS_LEN
    ) {
      return candidate
    }
  }

  return ''
}

export function formatWarehouseAddressDisplay(address: string | null | undefined): {
  text: string
  missing: boolean
} {
  const raw = address?.trim()
  if (!raw || isEgrulLegalAddressBoilerplate(raw)) {
    return { text: 'Адрес не указан', missing: true }
  }
  return { text: raw, missing: false }
}

/** Адрес склада/ОП из ЕГРЮЛ — отсекаем юридический «шаблонный» текст. */
export function sanitizeEgrulWarehouseAddress(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!trimmed || isEgrulLegalAddressBoilerplate(trimmed)) return ''
  return trimmed.length > 350 ? '' : trimmed
}

export const EGRUL_LEGAL_ADDRESS_STOP_RE =
  /(?:постоянного места жительства|преимущественного пребывания|органа государственной власти)/i

/** SQL для ручной очистки юридических «шаблонных» адресов в warehouses.address */
export const EGRUL_WAREHOUSE_ADDRESS_CLEANUP_SQL = `UPDATE warehouses
SET address = null
WHERE address LIKE '%постоянного места жительства%'
   OR address LIKE '%юридического лица%'
   OR address LIKE '%преимущественного пребывания%';`

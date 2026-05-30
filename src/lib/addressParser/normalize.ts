/** Единая нормализация пробелов и запятых перед разбором. */
export function normalizeAddressRaw(raw: string): string {
  return raw
    .replace(/\r\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*/g, ', ')
    .trim()
}

/** Деление на сегменты по запятым/точкам с запятой (типичный формат ЕГРЮЛ/реестра). */
export function splitAddressSegments(normalized: string): string[] {
  return normalized
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

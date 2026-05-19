import mammoth from 'mammoth'
import * as pdfjs from 'pdfjs-dist'
import type { ParsedEGRN, ParsedEGRYLData } from '../types'
import { diagnostics } from './diagnostics'
import {
  EGRUL_LEGAL_ADDRESS_STOP_RE,
  sanitizeEgrulLegalAddress,
  sanitizeEgrulWarehouseAddress,
} from './egrulAddress'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const CADASTRAL_PATTERN = /\b(\d{2}:\d{2}:\d{6,7}:\d+)\b/

const ADDRESS_PATTERNS = [
  /адрес\s*\(местоположение\)\s*:\s*([^\n]{10,300})/i,
  /(?:место\s+нахождения|адрес)[:\s]+([^\n]{10,200})/i,
  /(?:объект[:\s]+)?адрес[:\s]+([^\n]{10,200})/i,
  /(\d{6},?\s+[А-Яа-яЁё\s\-\.]+(?:д\.|дом|кв\.|корп\.|стр\.)[^\n]{5,150})/i,
]

const EGRN_SECTION_STOP = /^(Площадь|Назначение|Наименование)\b/i
const EGRN_REGION_LINE =
  /^[А-ЯЁ][а-яё]+(ая|ой|ий)\s+(область|край|республика|федерация)/i
const EGRN_AREA_RE = /(\d+[,.]?\d*)\s*(?:кв\.?\s*м|кв\.м\.?)/i

/** Extract physical address from ЕГРН extract (line-based). */
export function extractEGRNAddress(text: string): string {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  let startIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Российская Федерация') || EGRN_REGION_LINE.test(lines[i])) {
      startIdx = i
      break
    }
  }
  if (startIdx < 0) return ''

  const parts: string[] = []
  for (let i = startIdx; i < lines.length; i++) {
    if (i > startIdx && EGRN_SECTION_STOP.test(lines[i])) break
    parts.push(lines[i])
  }

  return parts
    .join(' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractEGRNArea(text: string): string {
  const areaMatch = text.match(EGRN_AREA_RE)
  if (areaMatch?.[1]) return areaMatch[1].replace(',', '.')

  const lines = text.replace(/\r\n/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!/^Площадь/i.test(trimmed)) continue

    const onLabel = trimmed.match(/(\d+[,.]?\d*)/)
    if (onLabel?.[1] && Number(onLabel[1].replace(',', '.')) >= 10) {
      return onLabel[1].replace(',', '.')
    }

    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const next = lines[j].trim()
      const num = next.match(/\b(\d{2,7}(?:[,.]\d+)?)\b/)
      if (num?.[1]) return num[1].replace(',', '.')
    }
  }
  return ''
}

const OWNER_PATTERNS = [
  /(?:правообладатель|арендатор|собственник)[:\s]+([^\n]{3,120})/i,
  /(?:наименование\s+правообладателя)[:\s]+([^\n]{3,120})/i,
]

const AREA_PATTERNS = [
  /площадь[:\s]+([\d\s,\.]+)\s*(?:кв\.?\s*м|м²|кв\.м)/i,
  /([\d]+[,\.]?\d*)\s*(?:кв\.?\s*м|м²)/i,
]

const RIGHT_TYPE_PATTERNS = [
  /вид\s+права[:\s]+([^\n]{3,80})/i,
  /(собственность|аренда|оперативное\s+управление)/i,
]

const REG_DATE_PATTERNS = [
  /дата\s+регистрации[:\s]+(\d{2}\.\d{2}\.\d{4})/i,
  /зарегистрирован[оа]?\s+(\d{2}\.\d{2}\.\d{4})/i,
  /(\d{2}\.\d{2}\.\d{4})\s*(?:г\.?)?\s*№\s*\d+/i,
]

export function parseEGRNText(text: string, options?: { log?: boolean }): ParsedEGRN {
  const normalized = text.replace(/\s+/g, ' ').replace(/\s+([,.:;])/g, '$1')

  let address = extractEGRNAddress(text)
  if (!address) {
    for (const pattern of ADDRESS_PATTERNS) {
      const match = text.match(pattern)
      if (match?.[1]) {
        address = match[1].trim().replace(/\s+/g, ' ')
        break
      }
    }
  }
  address = sanitizeEgrulWarehouseAddress(address)

  const cadMatch = text.match(/(?:кадастровый\s+номер|кадастровый\s+№)[:\s]*(\d{2}:\d{2}:\d{6,7}:\d+)/i)
    ?? normalized.match(CADASTRAL_PATTERN)
  const cadastralNumber = cadMatch?.[1]?.trim() ?? ''

  let ownerName = ''
  for (const pattern of OWNER_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      ownerName = match[1].trim().replace(/\s+/g, ' ')
      break
    }
  }

  let area = extractEGRNArea(text)
  if (!area) {
    for (const pattern of AREA_PATTERNS) {
      const match = text.match(pattern)
      if (match?.[1]) {
        area = match[1].trim().replace(/\s+/g, ' ')
        break
      }
    }
  }

  let rightType = ''
  for (const pattern of RIGHT_TYPE_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      rightType = match[1].trim()
      break
    }
  }

  let registrationDate = ''
  for (const pattern of REG_DATE_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      registrationDate = match[1].trim()
      break
    }
  }

  const result: ParsedEGRN = {
    address,
    cadastralNumber,
    ownerName,
    area,
    rightType,
    registrationDate,
    rawText: text.slice(0, 5000),
  }

  if (options?.log !== false) {
    if (!address) {
      diagnostics.warn('ЕГРН парсер', 'Адрес не найден — возможно скан')
    }
    diagnostics.success('ЕГРН парсер', 'Парсинг завершён', {
      cadastralNumber,
      address,
      area,
      ownerType: rightType || ownerName || undefined,
    })
  }

  return result
}

async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(pageText)
  }

  return pages.join('\n')
}

export async function parseEGRNPdf(file: File): Promise<ParsedEGRN> {
  try {
    const text = await extractPdfText(file)
    return parseEGRNText(text)
  } catch (error) {
    diagnostics.error('ЕГРН парсер', 'Ошибка извлечения текста', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

const EGRYL_CLIENT_INDICATORS = [
  'Полное наименование на русском языке',
  'Сокращенное наименование на русском языке',
  'ОГРН',
  'ИНН юридического лица',
  'КПП юридического лица',
  'Адрес юридического лица',
  'Дата присвоения ОГРН',
] as const

const LICENSE_ACTIVITY_LABEL =
  'Наименование лицензируемого вида деятельности, на который выдана лицензия'

const EGRYL_LICENSE_INDICATORS = [
  'Серия и номер лицензии',
  'Дата начала действия лицензии',
  'Дата окончания действия лицензии',
  LICENSE_ACTIVITY_LABEL,
  'Наименование лицензируемого вида деятельности',
  'Наименование лицензирующего органа',
] as const

const ALL_EGRYL_INDICATORS = [...EGRYL_CLIENT_INDICATORS, ...EGRYL_LICENSE_INDICATORS]

function normalizeEgrulText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function parseEgrulDate(raw: string): string {
  const m = raw.match(/(\d{2})[.\-/](\d{2})[.\-/](\d{4})/)
  if (!m) return raw.trim()
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Split PDF text into logical table rows (newline or "N Label" boundaries). */
function splitEgrulLines(text: string): string[] {
  const lines: string[] = []
  const rowSplit = /\s+(?=\d{1,3}\s+[А-ЯЁ])/

  for (const chunk of text.split(/\r?\n/)) {
    const trimmed = chunk.trim()
    if (!trimmed) continue
    if (rowSplit.test(trimmed)) {
      lines.push(...trimmed.split(rowSplit).map((p) => p.trim()).filter(Boolean))
    } else {
      lines.push(trimmed)
    }
  }
  return lines
}

function isNoiseLine(line: string): boolean {
  const t = line.trim()
  if (/^\d{1,3}$/.test(t)) return true
  if (/^\d{13}$/.test(t)) return true
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(t)) return true
  if (/^\d{13}\s+\d{2}\.\d{2}\.\d{4}$/.test(t)) return true
  return false
}

function lineLooksLikeTableRow(line: string): boolean {
  return /^\d{1,3}\s+[А-ЯЁ]/.test(line.trim())
}

function lineHasLabel(line: string, label: string): boolean {
  return line.toLowerCase().includes(label.toLowerCase())
}

function extractAfterLabel(line: string, label: string): string {
  const lower = line.toLowerCase()
  const idx = lower.indexOf(label.toLowerCase())
  if (idx === -1) return ''
  return line.slice(idx + label.length).trim()
}

function findLineValue(
  lines: string[],
  label: string,
  options?: {
    from?: number
    to?: number
    maxLookahead?: number
    mapValue?: (rest: string) => string
  },
): string {
  const from = options?.from ?? 0
  const to = options?.to ?? lines.length
  const maxLookahead = options?.maxLookahead ?? 3

  for (let i = from; i < to; i++) {
    if (!lineHasLabel(lines[i], label)) continue

    const candidates: string[] = []
    const sameLine = extractAfterLabel(lines[i], label)
    if (sameLine) candidates.push(sameLine)

    for (let j = i + 1; j < Math.min(i + 1 + maxLookahead, to); j++) {
      if (isNoiseLine(lines[j])) continue
      if (lineLooksLikeTableRow(lines[j]) && !lineHasLabel(lines[j], label)) break
      candidates.push(lines[j].trim())
    }

    for (const raw of candidates) {
      const value = options?.mapValue ? options.mapValue(raw) : raw
      if (value) return value
    }
  }
  return ''
}

function lastDigitToken(text: string, length: number): string {
  const tokens = text.split(/\s+/)
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (new RegExp(`^\\d{${length}}$`).test(tokens[i])) return tokens[i]
  }
  const m = text.match(new RegExp(`\\b(\\d{${length}})\\b`))
  return m?.[1] ?? ''
}

function firstDateToken(text: string): string {
  return text.match(/\d{2}\.\d{2}\.\d{4}/)?.[0] ?? ''
}

const LICENSE_NUMBER_PATTERN = /\d{2}[А-ЯЁ]{3}\d{7}/
const LEGAL_ADDRESS_PATTERN = /\d{6},[\s\S]+?(?=\d{1,3}\s+[А-ЯЁ]|ГРН|$)/

const EGRUL_VALUE_GARBAGE_PATTERN = /\s+\d+\s+ГРН|\s{2,}\d+\s/

function trimEgrulValueGarbage(value: string): string {
  const cut = value.search(EGRUL_VALUE_GARBAGE_PATTERN)
  return (cut === -1 ? value : value.slice(0, cut)).trim()
}

function extractLegalAddress(lines: string[]): string {
  for (let i = 0; i < lines.length; i++) {
    if (!lineHasLabel(lines[i], 'Адрес юридического лица')) continue

    let searchText = extractAfterLabel(lines[i], 'Адрес юридического лица')
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      if (lineLooksLikeTableRow(lines[j]) && !lineHasLabel(lines[j], 'Адрес юридического лица')) break
      if (isNoiseLine(lines[j])) continue
      searchText += ` ${lines[j]}`
    }

    const stopAt = searchText.search(EGRUL_LEGAL_ADDRESS_STOP_RE)
    if (stopAt > 0) {
      const afterBoilerplate = searchText.slice(stopAt)
      const postalInTail = afterBoilerplate.match(LEGAL_ADDRESS_PATTERN)
      if (postalInTail) {
        return sanitizeEgrulLegalAddress(postalInTail[0])
      }
      searchText = searchText.slice(0, stopAt)
    }

    const m = searchText.match(LEGAL_ADDRESS_PATTERN)
    const raw = m?.[0]?.replace(/\s+/g, ' ').trim() ?? ''
    return sanitizeEgrulLegalAddress(raw)
  }
  return ''
}

const EGRUL_BRANCH_ADDRESS_LABELS = [
  'Адрес (место нахождения) обособленного подразделения',
  'Место нахождения обособленного подразделения',
] as const

function extractEgrulBranchAddresses(lines: string[]): Array<{ address: string; kpp?: string }> {
  const branches: Array<{ address: string; kpp?: string }> = []
  const seen = new Set<string>()

  for (const label of EGRUL_BRANCH_ADDRESS_LABELS) {
    const raw = findLineValue(lines, label, { maxLookahead: 5 })
    const address = sanitizeEgrulWarehouseAddress(raw)
    if (!address || seen.has(address)) continue
    seen.add(address)
    branches.push({ address })
  }

  for (let i = 0; i < lines.length; i++) {
    if (!/обособленн/i.test(lines[i]) || !/подразделен/i.test(lines[i])) continue
    if (!lineHasLabel(lines[i], 'КПП')) continue
    const kpp = lastDigitToken(lines[i], 9)
    if (!kpp) continue

    let address = ''
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      if (lineLooksLikeTableRow(lines[j]) && lineHasLabel(lines[j], 'КПП')) break
      const candidate = sanitizeEgrulWarehouseAddress(lines[j])
      if (candidate && /\d{6},/.test(candidate)) {
        address = candidate
        break
      }
    }
    if (!address || seen.has(address)) continue
    seen.add(address)
    branches.push({ address, kpp })
  }

  return branches
}

function extractLicenseActivity(lines: string[], from: number, to: number, sectionText: string): string {
  let raw =
    findLineValue(lines, LICENSE_ACTIVITY_LABEL, { from, to, maxLookahead: 5 }) ||
    findIndicatorValue(sectionText, LICENSE_ACTIVITY_LABEL, [...EGRYL_LICENSE_INDICATORS])

  if (!raw) {
    raw = findLineValue(lines, 'Наименование лицензируемого вида деятельности', {
      from,
      to,
      maxLookahead: 5,
    })
  }

  const stripMarker = 'выдана лицензия'
  const markerIdx = raw.toLowerCase().indexOf(stripMarker)
  if (markerIdx !== -1) {
    raw = raw.slice(markerIdx + stripMarker.length)
  }

  return trimEgrulValueGarbage(raw.replace(/^[,.\s]+/, ''))
}

function extractLicenseNumber(value: string): string {
  const m = value.match(LICENSE_NUMBER_PATTERN)
  if (m) return m[0]
  return value.trim()
}

function findIndicatorValue(text: string, indicator: string, scopeIndicators = ALL_EGRYL_INDICATORS): string {
  const normalized = normalizeEgrulText(text)
  const lower = normalized.toLowerCase()
  const needle = indicator.toLowerCase()
  const idx = lower.indexOf(needle)
  if (idx === -1) return ''

  let start = idx + indicator.length
  let end = normalized.length

  for (const other of scopeIndicators) {
    if (other.toLowerCase() === needle) continue
    const otherIdx = lower.indexOf(other.toLowerCase(), start)
    if (otherIdx !== -1 && otherIdx < end) end = otherIdx
  }

  // Strip table row number only before Cyrillic text, not digits inside values (e.g. 50ЗАП…)
  return normalized.slice(start, end).trim().replace(/^\d{1,3}\s+(?=[А-ЯЁ«"])/, '')
}

function findLicenseSectionRange(lines: string[]): { from: number; to: number } {
  const idx = lines.findIndex((l) => /сведения\s+о\s+лицензиях/i.test(l))
  if (idx === -1) return { from: 0, to: 0 }
  return { from: idx, to: lines.length }
}

function extractDigits(text: string, length: number): string {
  const m = text.match(new RegExp(`\\b(\\d{${length}})\\b`))
  return m?.[1] ?? ''
}

function extractOgrn(text: string): string {
  const fromLabel = findIndicatorValue(text, 'ОГРН', [...ALL_EGRYL_INDICATORS])
  const fromLabelDigits = extractDigits(fromLabel, 13)
  if (fromLabelDigits) return fromLabelDigits

  const headerMatch = text.match(/ОГРН\s*(\d{13})/i)
  if (headerMatch?.[1]) return headerMatch[1]

  const afterOgrn = text.match(/(?:^|\s)ОГРН(?:\s|$)[^\d]*(\d{13})/i)
  return afterOgrn?.[1] ?? ''
}

export function parseEGRYLText(text: string, options?: { log?: boolean }): ParsedEGRYLData {
  const lines = splitEgrulLines(text)
  const licenseRange = findLicenseSectionRange(lines)
  const licenseSectionText =
    licenseRange.to > licenseRange.from ? lines.slice(licenseRange.from).join(' ') : ''

  const fullName = trimEgrulValueGarbage(
    findIndicatorValue(text, 'Полное наименование на русском языке'),
  )
  const shortName = trimEgrulValueGarbage(
    findIndicatorValue(text, 'Сокращенное наименование на русском языке'),
  )
  const ogrn = extractOgrn(text)

  const inn = findLineValue(lines, 'ИНН юридического лица', {
    mapValue: (rest) => lastDigitToken(rest, 10),
  })

  const kpp = findLineValue(lines, 'КПП юридического лица', {
    mapValue: (rest) => lastDigitToken(rest, 9),
  })

  const legalAddress = extractLegalAddress(lines)
  const branches = extractEgrulBranchAddresses(lines)

  const regDateRaw = findLineValue(lines, 'Дата присвоения ОГРН', {
    mapValue: (rest) => firstDateToken(rest),
  })
  const registrationDate = regDateRaw ? parseEgrulDate(regDateRaw) : undefined

  const licenseNumber = licenseRange.to > licenseRange.from
    ? findLineValue(lines, 'Серия и номер лицензии', {
        from: licenseRange.from,
        to: licenseRange.to,
        mapValue: extractLicenseNumber,
      })
    : ''
  const issueDateRaw = licenseRange.to > licenseRange.from
    ? findLineValue(lines, 'Дата начала действия лицензии', {
        from: licenseRange.from,
        to: licenseRange.to,
        mapValue: (rest) => firstDateToken(rest),
      })
    : ''
  const expiryDateRaw = licenseRange.to > licenseRange.from
    ? findLineValue(lines, 'Дата окончания действия лицензии', {
        from: licenseRange.from,
        to: licenseRange.to,
        mapValue: (rest) => firstDateToken(rest),
      })
    : ''
  const licenseActivity =
    licenseRange.to > licenseRange.from
      ? extractLicenseActivity(lines, licenseRange.from, licenseRange.to, licenseSectionText)
      : ''
  const licenseAuthority = licenseSectionText
    ? trimEgrulValueGarbage(
        findIndicatorValue(
          licenseSectionText,
          'Наименование лицензирующего органа',
          [...EGRYL_LICENSE_INDICATORS],
        ),
      )
    : ''

  const hasLicense =
    licenseNumber || issueDateRaw || expiryDateRaw || licenseActivity || licenseAuthority

  const result: ParsedEGRYLData = {
    client: {
      fullName,
      shortName,
      ogrn,
      inn,
      kpp,
      legalAddress,
      registrationDate,
    },
    rawText: text.slice(0, 8000),
  }

  if (branches.length > 0) {
    result.branches = branches
  }

  if (hasLicense) {
    result.license = {
      licenseNumber,
      issueDate: issueDateRaw ? parseEgrulDate(issueDateRaw) : '',
      expiryDate: expiryDateRaw ? parseEgrulDate(expiryDateRaw) : '',
      licenseActivity,
      licenseAuthority,
    }
  }

  if (options?.log !== false) {
    if (!inn) diagnostics.warn('ЕГРЮЛ парсер', 'ИНН не найден')
    diagnostics.success('ЕГРЮЛ парсер', 'Реквизиты извлечены', {
      fullName,
      inn,
      kpp,
      ogrn,
      legalAddress,
    })
    if (hasLicense && result.license) {
      diagnostics.success('ЕГРЮЛ парсер', 'Лицензия найдена', {
        licenseNumber: result.license.licenseNumber,
        issueDate: result.license.issueDate,
        expiryDate: result.license.expiryDate,
      })
    } else {
      diagnostics.warn('ЕГРЮЛ парсер', 'Лицензия не найдена в документе')
    }
  }

  return result
}

export async function parseEGRYLPdf(file: File): Promise<ParsedEGRYLData> {
  diagnostics.info('ЕГРЮЛ парсер', 'Начало парсинга', { filename: file.name })
  try {
    const text = await extractPdfText(file)
    return parseEGRYLText(text)
  } catch (error) {
    diagnostics.error('ЕГРЮЛ парсер', 'Ошибка извлечения текста', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

export async function parseEGRNFile(file: File): Promise<ParsedEGRN> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  const format = ext ?? 'unknown'
  diagnostics.info('ЕГРН парсер', 'Начало парсинга', { filename: file.name, format })
  try {
    if (ext === 'pdf') return await parseEGRNPdf(file)
    if (ext === 'docx') {
      const text = await extractTextFromDocx(file)
      return parseEGRNText(text)
    }
    throw new Error('Поддерживаются файлы .docx и .pdf')
  } catch (error) {
    if (!(error instanceof Error && error.message.includes('извлечения'))) {
      diagnostics.error('ЕГРН парсер', 'Ошибка извлечения текста', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    throw error
  }
}

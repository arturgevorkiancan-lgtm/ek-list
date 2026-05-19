import type { ParsedRentalData } from '../types'
import { diagnostics } from './diagnostics'
import { extractTextFromDocx } from './egrnParser'
import { extractPdfText, isProbablyScannedPdf } from './pdfText'

const EMPTY: ParsedRentalData = {
  isProbablyScan: false,
  rawText: '',
}

function parseDotDate(raw: string): string {
  const m = raw.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/)
  if (!m) return ''
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function parseArea(text: string): number | undefined {
  const m = text.match(/(\d+[,.]?\d*)\s*(?:кв\.?\s*м|м²|кв\.м)/i)
  if (!m) return undefined
  return Number(m[1].replace(',', '.'))
}

function extractContractNumber(text: string): string | undefined {
  const near = text.match(
    /(?:договор\s+аренды|договора\s+аренды)[^\n№N]{0,80}[№N]\s*([^\s,;]+)/i,
  )
  if (near?.[1]) return near[1].replace(/[«»"]/g, '').trim()

  const generic = text.match(/[№N]\s*(\d[\d\-\/]*)/i)
  return generic?.[1]?.trim()
}

function extractLabeledValue(text: string, label: string): string | undefined {
  const re = new RegExp(`${label}\\s*:?\\s*([^\\n]{3,300})`, 'i')
  const m = text.match(re)
  return m?.[1]?.trim().replace(/\s+/g, ' ')
}

function extractRentPeriod(text: string): { start?: string; end?: string } {
  const section = text.match(
    /(?:срок\s+аренды|срок\s+действия)[:\s]*([\s\S]{0,400})/i,
  )?.[1]
  if (!section) return {}

  const dates = [...section.matchAll(/(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})/g)].map((m) =>
    parseDotDate(m[1]),
  )
  return { start: dates[0], end: dates[1] }
}

function extractObjectAddress(text: string): string | undefined {
  const patterns = [
    /(?:объект\s+аренды|предмет\s+договора)[:\s]*([\s\S]{0,500}?)(?=(?:площад|срок|аренд|размер|\d+\.\s))/i,
    /(?:адрес\s+(?:объекта|помещения))[:\s]+([^\n]{10,300})/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m?.[1]) {
      const addr = m[1].replace(/\s+/g, ' ').trim()
      if (addr.length >= 10) return addr.slice(0, 400)
    }
  }
  return undefined
}

export function parseRentalText(text: string, options?: { log?: boolean }): ParsedRentalData {
  const rawText = text.slice(0, 12000)
  if (isProbablyScannedPdf(text)) {
    if (options?.log !== false) {
      diagnostics.warn('Договор аренды', 'Документ является сканом — автозаполнение недоступно')
    }
    return { ...EMPTY, isProbablyScan: true, rawText }
  }

  const contractNumber = extractContractNumber(text)
  const contractDateRaw = text.match(
    /(?:договор\s+аренды|от)\s+[^\d]*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})/i,
  )?.[1]
  const contractDate = contractDateRaw ? parseDotDate(contractDateRaw) : undefined

  const landlordName =
    extractLabeledValue(text, 'Арендодатель') ??
    extractLabeledValue(text, 'арендодатель')
  const tenantName =
    extractLabeledValue(text, 'Арендатор') ?? extractLabeledValue(text, 'арендатор')

  const address = extractObjectAddress(text)
  const areaSqm = parseArea(text)
  const period = extractRentPeriod(text)

  const result: ParsedRentalData = {
    contractNumber,
    contractDate,
    landlordName,
    tenantName,
    address,
    areaSqm,
    rentStart: period.start,
    rentEnd: period.end,
    isProbablyScan: false,
    rawText,
  }

  if (options?.log !== false) {
    diagnostics.success('Договор аренды', 'Данные извлечены', {
      contractNumber,
      contractDate,
      landlord: landlordName,
      area: areaSqm,
    })
  }

  return result
}

export async function parseRentalPdf(file: File): Promise<ParsedRentalData> {
  const text = await extractPdfText(file)
  return parseRentalText(text)
}

export async function parseRentalDocx(file: File): Promise<ParsedRentalData> {
  const text = await extractTextFromDocx(file)
  return parseRentalText(text)
}

export async function parseRentalFile(file: File): Promise<ParsedRentalData> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  diagnostics.info('Договор аренды', 'Начало парсинга', { filename: file.name })
  try {
    if (ext === 'pdf') return await parseRentalPdf(file)
    if (ext === 'docx') return await parseRentalDocx(file)
    throw new Error('Договор аренды: поддерживаются PDF и DOCX')
  } catch (error) {
    diagnostics.error('Договор аренды', 'Ошибка извлечения текста', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

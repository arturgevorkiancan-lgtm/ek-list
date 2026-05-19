import { diagnostics } from './diagnostics'
import { extractPdfText } from './pdfText'
import type { ParsedOPNotification } from '../types'

const EMPTY: ParsedOPNotification = {
  format: 'form_1_3',
  organizationName: '',
  inn: '',
  kppMain: '',
  kppOP: '',
  opAddress: '',
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

function parseDateToken(raw: string): string | undefined {
  const m = raw.match(/(\d{2})[.\-/](\d{2})[.\-/](\d{4})/)
  if (!m) return undefined
  return `${m[3]}-${m[2]}-${m[1]}`
}

function extractKppAfterLabel(text: string, labelRe: RegExp): string {
  const match = labelRe.exec(text)
  if (!match) return ''
  const after = text.slice(match.index + match[0].length, match.index + match[0].length + 120)
  const m = after.match(/\b(\d{9})\b/)
  return m?.[1] ?? ''
}

function parseForm13(text: string): ParsedOPNotification {
  const orgMatch =
    text.match(/(?:АКЦИОНЕРНОЕ ОБЩЕСТВО|ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ|ПУБЛИЧНОЕ АКЦИОНЕРНОЕ)[^\n]{5,200}/i) ??
    text.match(/УВЕДОМЛЕНИЕ[\s\S]{0,200}?\n\s*([^\n]{10,200})/i)
  const organizationName = orgMatch?.[0]?.replace(/\s+/g, ' ').trim() ?? ''

  const ogrn = text.match(/\bОГРН\b[^\d]*(\d{13})\b/i)?.[1]

  const innKpp =
    text.match(/ИНН\s*\/\s*КПП[^\d]*(\d{10})\s*\/\s*(\d{9})/i) ??
    text.match(/(\d{10})\s*\/\s*(\d{9})/)
  const inn = innKpp?.[1] ?? ''
  const kppMain = innKpp?.[2] ?? ''

  const regMatch = text.match(
    /ПОСТАВЛЕН[АОЫ]?\s+НА\s+УЧЕТ[^\d]*(\d{2}[.\-/]\d{2}[.\-/]\d{4})/i,
  )
  const registrationDate = regMatch?.[1] ? parseDateToken(regMatch[1]) : undefined

  let opAddress = ''
  const addrLabel = /ПО\s+МЕСТУ\s+НАХОЖДЕНИЯ\s+ОБОСОБЛЕННОГО\s+ПОДРАЗДЕЛЕНИЯ/i
  const addrMatch = addrLabel.exec(text)
  if (addrMatch) {
    const after = text.slice(addrMatch.index + addrMatch[0].length)
    const block = after.split(/\n{2,}/)[0] ?? after.slice(0, 500)
    opAddress = block.replace(/\s+/g, ' ').trim()
    const stop = opAddress.search(/ПРИСВОЕН\s+КПП|ИНН|ОГРН/i)
    if (stop > 0) opAddress = opAddress.slice(0, stop).trim()
  }

  const kppOP = extractKppAfterLabel(text, /ПРИСВОЕН\s+КПП/i)

  return {
    format: 'form_1_3',
    organizationName,
    ogrn,
    inn,
    kppMain,
    kppOP,
    opAddress,
    registrationDate,
  }
}

function parseEgrnExtract(text: string): ParsedOPNotification {
  const orgMatch = text.match(
    /Выписка из Единого государственного реестра налогоплательщиков[\s\S]{0,400}?\n\s*([А-ЯЁ«][^\n]{10,200})/i,
  )
  const organizationName = orgMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? ''

  const innKpp = text.match(/(\d{10})\s*\/\s*(\d{9})/)
  const inn = innKpp?.[1] ?? ''
  const kppMain = innKpp?.[2] ?? ''

  let opAddress = ''
  const addrRow = text.match(
    /Адрес\s*\(место\s+нахождения\)\s+обособленного\s+подразделения[^\n]*\n\s*([^\n]{10,400})/i,
  )
  if (addrRow?.[1]) opAddress = addrRow[1].replace(/\s+/g, ' ').trim()

  let kppOP = ''
  const kppRow = text.match(/(?:^|\n)\s*3\s+[^\n]*КПП[^\n]*\n\s*(\d{9})/im)
  if (kppRow?.[1]) kppOP = kppRow[1]
  if (!kppOP) kppOP = extractKppAfterLabel(text, /\bКПП\b/i)

  let registrationDate: string | undefined
  const dateRow = text.match(
    /Дата\s+постановки\s+на\s+учет[^\d]*(\d{2}[.\-/]\d{2}[.\-/]\d{4})/i,
  )
  if (dateRow?.[1]) registrationDate = parseDateToken(dateRow[1])

  return {
    format: 'egrn_extract',
    organizationName,
    inn,
    kppMain,
    kppOP,
    opAddress,
    registrationDate,
  }
}

function detectFormat(text: string): 'form_1_3' | 'egrn_extract' {
  if (/Выписка из Единого государственного реестра налогоплательщиков/i.test(text)) {
    return 'egrn_extract'
  }
  return 'form_1_3'
}

export function parseOPNotificationText(text: string, options?: { log?: boolean }): ParsedOPNotification {
  const normalized = normalizeText(text)
  const format = detectFormat(normalized)
  const parsed = format === 'egrn_extract' ? parseEgrnExtract(normalized) : parseForm13(normalized)

  if (!parsed.organizationName && !parsed.kppOP && !parsed.inn) {
    return { ...EMPTY, rawText: text.slice(0, 5000) }
  }

  const result = { ...parsed, rawText: text.slice(0, 5000) }

  if (options?.log !== false) {
    if (result.kppOP) {
      diagnostics.success('Уведомление ОП', 'КПП извлечён', {
        kppOP: result.kppOP,
        opAddress: result.opAddress,
      })
    } else {
      diagnostics.warn('Уведомление ОП', 'КПП не найден')
    }
  }

  return result
}

export async function parseOPNotificationPdf(file: File): Promise<ParsedOPNotification> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  const format = ext ?? 'pdf'
  diagnostics.info('Уведомление ОП', 'Начало парсинга', { filename: file.name, format })
  try {
    const text = await extractPdfText(file)
    return parseOPNotificationText(text)
  } catch (error) {
    diagnostics.error('Уведомление ОП', 'Ошибка извлечения текста', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

import type { ParsedLicenseData } from '../types'
import { diagnostics } from './diagnostics'
import { extractTextFromDocx } from './egrnParser'
import { extractPdfText } from './pdfText'

const LICENSE_NUMBER_RE = /\d{2,3}[А-ЯЁ]{2,3}\d{7}/

const SHORT_MONTHS: Record<string, string> = {
  янв: '01',
  фев: '02',
  мар: '03',
  апр: '04',
  май: '05',
  июн: '06',
  июл: '07',
  авг: '08',
  сен: '09',
  окт: '10',
  ноя: '11',
  дек: '12',
}

const FULL_MONTHS: Record<string, string> = {
  января: '01',
  февраля: '02',
  марта: '03',
  апреля: '04',
  мая: '05',
  июня: '06',
  июля: '07',
  августа: '08',
  сентября: '09',
  октября: '10',
  ноября: '11',
  декабря: '12',
}

const EMPTY_DATA: ParsedLicenseData = {
  licenseNumber: '',
  inn: '',
  kpp: '',
  issueDate: '',
  expiryDate: '',
  licenseActivity: '',
  licenseStatus: '',
  branches: [],
  format: 'registry_table',
  rawText: '',
}

const SHORT_DATE_RE =
  /(\d{1,2})\s+(янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)\s+(\d{4})/gi

const RATK_LEGAL_ADDRESS_STOP =
  /(?:Адрес электронной почты|Лицензируемый вид)/i

async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return extractPdfText(file)
  if (ext === 'docx') return extractTextFromDocx(file)
  throw new Error('Поддерживаются файлы .docx и .pdf')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toIsoDate(day: string, monthKey: string, year: string, months: Record<string, string>): string {
  const mm = months[monthKey.toLowerCase()]
  if (!mm) return ''
  return `${year}-${mm}-${pad2(Number(day))}`
}

function parseShortDates(text: string): string[] {
  const dates: string[] = []
  for (const m of text.matchAll(SHORT_DATE_RE)) {
    const iso = toIsoDate(m[1], m[2], m[3], SHORT_MONTHS)
    if (iso) dates.push(iso)
  }
  return dates
}

function parseFullDateFromMatch(m: RegExpMatchArray): string {
  return toIsoDate(m[1], m[2], m[3], FULL_MONTHS)
}

function findLicenseNumber(text: string): string {
  const m = text.match(LICENSE_NUMBER_RE)
  return m?.[0] ?? ''
}

function parseLicenseStatus(text: string): string {
  if (/аннулирован/i.test(text)) return 'аннулирована'
  if (/приостановлен/i.test(text)) return 'приостановлена'
  if (/действующ/i.test(text)) return 'действующая'
  return ''
}

/** Status only from the dedicated RATK label row (BUG 3). */
function parseRatkLicenseStatus(text: string): string {
  const labelRe = /Сведения о действии лицензии:\s*/i
  const labelMatch = labelRe.exec(text)
  if (!labelMatch) return ''

  const after = text.slice(labelMatch.index + labelMatch[0].length)
  const lineMatch = after.match(/^([^\n]+)/)
  const chunk = (lineMatch?.[1] ?? after.slice(0, 80)).trim()

  if (/действующ/i.test(chunk)) return 'действующая'
  if (/аннулирован/i.test(chunk)) return 'аннулирована'
  if (/приостановлен/i.test(chunk)) return 'приостановлена'

  const nextLine = after.match(/\n\s*([^\n]+)/)
  const next = nextLine?.[1]?.trim() ?? ''
  if (/действующ/i.test(next)) return 'действующая'
  if (/аннулирован/i.test(next)) return 'аннулирована'
  if (/приостановлен/i.test(next)) return 'приостановлена'

  return ''
}

/** Legal address bounded by next bold labels (BUG 1). */
function extractRatkLegalAddress(text: string): string {
  const labelRe = /Место нахождения лицензиата:\s*/i
  const labelMatch = labelRe.exec(text)
  if (!labelMatch) return ''

  const after = text.slice(labelMatch.index + labelMatch[0].length)
  const stopMatch = RATK_LEGAL_ADDRESS_STOP.exec(after)
  const raw = stopMatch ? after.slice(0, stopMatch.index) : after.split('\n')[0] ?? ''

  return raw
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',,')
    .trim()
}

/** Activity value: only the next non-empty line after label ending with «продукции»:». */
function extractRatkLicenseActivity(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!/продукции»\s*:/.test(line)) continue
    if (!/Лицензируемый вид деятельности/i.test(line) && i > 0) {
      const prev = lines.slice(Math.max(0, i - 3), i + 1).join(' ')
      if (!/Лицензируемый вид деятельности/i.test(prev)) continue
    }

    const afterColon = line.replace(/^[\s\S]*?продукции»\s*:\s*/i, '').trim()
    if (afterColon) {
      return afterColon.replace(/\s+/g, ' ').replace(/;+\s*$/, '').trim()
    }

    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim()
      if (next) {
        return next.replace(/\s+/g, ' ').replace(/;+\s*$/, '').trim()
      }
    }
    return ''
  }

  const fallback = text.match(
    /(?:лицензируемый вид деятельности|вид деятельности)[:\s]+([^\n]{10,300})/i,
  )
  return fallback?.[1]?.replace(/\s+/g, ' ').replace(/;+\s*$/, '').trim() ?? ''
}

/** Strip footnotes and page markers from branch addresses (BUG 4). */
function cleanBranchAddress(address: string): string {
  let cleaned = address.replace(/\s+/g, ' ').trim()

  const pageIdx = cleaned.search(/Страница\s+\d+\s+из/i)
  if (pageIdx >= 0) cleaned = cleaned.slice(0, pageIdx).trim()

  const footnoteIdx = cleaned.search(/1\s+Указывается структура/i)
  if (footnoteIdx >= 0) cleaned = cleaned.slice(0, footnoteIdx).trim()

  cleaned = cleaned.replace(/\s+\d\s*$/g, '').trim()

  return cleaned
}

function extractBranchesByKpp(
  text: string,
  mainKpp: string,
  sectionStart = 0,
  cleanAddress = false,
): Array<{ kpp: string; address: string }> {
  const section = text.slice(sectionStart)
  const branches: Array<{ kpp: string; address: string }> = []
  const seen = new Set<string>()

  const re = /(Россия[\s\S]*?)\s+(\d{9})\b/g
  for (const m of section.matchAll(re)) {
    const kpp = m[2]
    if (kpp === mainKpp || seen.has(kpp)) continue

    let address = m[1]
    if (cleanAddress) {
      const nextKppInAddr = address.search(/\s\d{9}\s*$/)
      if (nextKppInAddr > 0) address = address.slice(0, nextKppInAddr)
      address = cleanBranchAddress(address)
    } else {
      address = address.replace(/\s+/g, ' ').trim()
    }

    if (address.length < 10) continue
    seen.add(kpp)
    branches.push({ kpp, address })
  }

  return branches
}

function parseRegistryTable(text: string): ParsedLicenseData {
  const licenseNumber = findLicenseNumber(text)
  const innMatch = text.match(/\b(\d{10})\b/)
  const inn = innMatch?.[1] ?? ''

  let kpp = ''
  if (innMatch) {
    const afterInn = text.slice(text.indexOf(innMatch[0]) + innMatch[0].length)
    const kppMatch = afterInn.match(/\b(\d{9})\b/)
    kpp = kppMatch?.[1] ?? ''
  }

  const shortDates = parseShortDates(text)
  const issueDate = shortDates[0] ?? ''
  const expiryDate = shortDates[1] ?? ''

  const status = parseLicenseStatus(text)

  let licenseActivity = ''
  const activityMatch = text.match(
    /(Закупка[\s\S]{10,200}?алкогольн[\s\S]{5,120}?)(?=\s*\.{2,}|\s*\d{1,2}\s+(?:янв|фев|мар|апр|май|июн|июл|авг|сен|окт|дек))/i,
  )
  if (activityMatch) {
    licenseActivity = activityMatch[1].replace(/\s+/g, ' ').trim()
  } else {
    const generic = text.match(
      /((?:Закупка|Производство|Хранение|Розничная|Оптовая)[^\n]{15,250}алкоголь[^\n]{0,80})/i,
    )
    licenseActivity = generic?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
  }

  let branches: Array<{ kpp: string; address: string }> = []
  const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w+/)
  if (emailMatch && kpp) {
    const afterEmailIdx = text.indexOf(emailMatch[0]) + emailMatch[0].length
    branches = extractBranchesByKpp(text, kpp, afterEmailIdx)
  } else if (kpp) {
    const afterMainKpp = text.indexOf(kpp) + kpp.length
    branches = extractBranchesByKpp(text, kpp, afterMainKpp)
  }

  const email = emailMatch?.[0]

  let legalAddress: string | undefined
  if (kpp && innMatch) {
    const blockStart = text.indexOf(kpp) + kpp.length
    const blockEnd = emailMatch ? text.indexOf(emailMatch[0]) : text.length
    const block = text.slice(blockStart, blockEnd)
    const addrMatch = block.match(/(Россия[\s\S]*?)(?=[\w.+-]+@|$)/)
    if (addrMatch) legalAddress = addrMatch[1].replace(/\s+/g, ' ').trim()
  }

  return {
    licenseNumber,
    inn,
    kpp,
    legalAddress,
    email,
    issueDate,
    expiryDate,
    licenseActivity,
    licenseStatus: status,
    branches,
    format: 'registry_table',
    rawText: text,
  }
}

function parseRatkExtract(text: string): ParsedLicenseData {
  const licenseNumber = findLicenseNumber(text)

  const innKppMatch = text.match(/ИНН\/КПП\s+лицензиата:\s*(\d{10})\/(\d{9})/i)
  const inn = innKppMatch?.[1] ?? ''
  const kpp = innKppMatch?.[2] ?? ''

  const fullNameMatch = text.match(
    /Полное наименование и организационно-правовая форма лицензиата:\s*([^\n]+)/i,
  )
  const fullName = fullNameMatch?.[1]?.trim()

  const legalAddress = extractRatkLegalAddress(text) || undefined

  const emailMatch = text.match(/Адрес электронной почты лицензиата:\s*([^\s\n]+)/i)
  const email = emailMatch?.[1]?.trim()

  const issueMatch = text.match(
    /(?:срок действия лицензии[\s\S]*?)?с\s+(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})\s*г/i,
  )
  const expiryMatch = text.match(
    /до\s+(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})\s*г/i,
  )
  const issueDate = issueMatch ? parseFullDateFromMatch(issueMatch) : ''
  const expiryDate = expiryMatch ? parseFullDateFromMatch(expiryMatch) : ''

  const licenseActivity = extractRatkLicenseActivity(text)

  const status = parseRatkLicenseStatus(text) || 'действующая'

  const branchSectionMatch = text.match(
    /(?:обособленн[\s\S]{0,40}подразделен|места осуществления)[\s\S]*/i,
  )
  const branchSection = branchSectionMatch?.[0] ?? text
  const branches = extractBranchesByKpp(branchSection, kpp, 0, true)

  return {
    licenseNumber,
    inn,
    kpp,
    fullName,
    legalAddress,
    email,
    issueDate,
    expiryDate,
    licenseActivity,
    licenseStatus: status,
    branches,
    format: 'ratk_extract',
    rawText: text,
  }
}

function isRegistryTableFormat(text: string): boolean {
  const hasStatus = /(?:действующая|приостановлена|аннулирована)/i.test(text)
  const hasShortDate = SHORT_DATE_RE.test(text)
  SHORT_DATE_RE.lastIndex = 0
  return hasStatus && hasShortDate
}

function isRatkExtractFormat(text: string): boolean {
  return (
    /государственного сводного реестра/i.test(text) ||
    /РОСАЛКОГОЛЬТАБАККОНТРОЛЬ/i.test(text) ||
    /Росалкогольрегулирование/i.test(text)
  )
}

function parseLegacyText(text: string): ParsedLicenseData {
  const licenseMatch =
    text.match(/№\s*(РА[\-\s]?\d[\d\-\/]*)/i) ??
    text.match(/лицензи[ия]\s+№\s*([^\n,]{4,40})/i)
  const licenseNumber =
    findLicenseNumber(text) ||
    licenseMatch?.[1]?.replace(/\s+/g, ' ').trim() ||
    ''

  const issueMatch = text.match(/выдан[аоы]?\s+[^0-9]*(\d{2}[.\-/]\d{2}[.\-/]\d{4})/i)
  const expiryMatch =
    text.match(
      /(?:действие\s+до|срок\s+действия|действительн[аоы]\s+до)[:\s]+(\d{2}[.\-/]\d{2}[.\-/]\d{4})/i,
    ) ?? text.match(/до\s+(\d{2}[.\-/]\d{2}[.\-/]\d{4})/i)

  const parseDotDate = (raw: string): string => {
    const m = raw.match(/(\d{2})[.\-/](\d{2})[.\-/](\d{4})/)
    return m ? `${m[3]}-${m[2]}-${m[1]}` : raw.trim()
  }

  const orgMatch =
    text.match(/(?:наименование\s+организации|лицензиат)[:\s]+([^\n]{5,200})/i) ??
    text.match(/(?:ООО|АО|ПАО|ИП)\s+[«"]?[^»"\n]+[»"]?/i)

  const innMatch = text.match(/ИНН[:\s]+(\d{10}|\d{12})/i)

  const branches: Array<{ kpp: string; address: string }> = []
  const addrBlocks = text.matchAll(
    /(?:адрес\s+обособленного\s+подразделения|место\s+осуществления\s+деятельности)[:\s]+([^\n]{10,250})/gi,
  )
  for (const m of addrBlocks) {
    const address = m[1].trim().replace(/\s+/g, ' ')
    if (address && !branches.some((b) => b.address === address)) {
      branches.push({ kpp: '', address })
    }
  }

  const kppMatches = [...text.matchAll(/КПП[:\s]+(\d{9})/gi)]
  kppMatches.forEach((m, i) => {
    if (branches[i]) branches[i].kpp = m[1]
    else branches.push({ kpp: m[1], address: '' })
  })

  return {
    ...EMPTY_DATA,
    licenseNumber,
    inn: innMatch?.[1] ?? '',
    fullName: orgMatch?.[0]?.trim() ?? orgMatch?.[1]?.trim(),
    issueDate: issueMatch?.[1] ? parseDotDate(issueMatch[1]) : '',
    expiryDate: expiryMatch?.[1] ? parseDotDate(expiryMatch[1]) : '',
    licenseStatus: parseLicenseStatus(text),
    branches,
    format: 'registry_table',
    rawText: text.slice(0, 8000),
  }
}

function logLicenseResult(data: ParsedLicenseData, options?: { log?: boolean }): ParsedLicenseData {
  if (options?.log === false) return data

  if (!data.licenseNumber) {
    diagnostics.warn('Лицензия парсер', 'Номер лицензии не найден')
  }
  if (!data.expiryDate) {
    diagnostics.warn('Лицензия парсер', 'Дата окончания не найдена')
  }

  diagnostics.success('Лицензия парсер', 'Данные лицензии извлечены', {
    licenseNumber: data.licenseNumber,
    issueDate: data.issueDate,
    expiryDate: data.expiryDate,
    status: data.licenseStatus,
    branchCount: data.branches.length,
  })

  for (const branch of data.branches) {
    if (branch.kpp || branch.address) {
      diagnostics.success('Лицензия парсер', 'Филиал найден', {
        kpp: branch.kpp,
        address: branch.address,
      })
    }
  }

  return data
}

export function parseLicenseText(text: string, options?: { log?: boolean }): ParsedLicenseData {
  const normalized = text.replace(/\r\n/g, '\n')
  let data: ParsedLicenseData
  if (isRatkExtractFormat(normalized)) data = parseRatkExtract(normalized)
  else if (isRegistryTableFormat(normalized)) data = parseRegistryTable(normalized)
  else data = parseLegacyText(normalized)
  return logLicenseResult(data, options)
}

export async function parseLicensePdf(file: File): Promise<ParsedLicenseData> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'pdf') throw new Error('parseLicensePdf принимает только PDF')
  try {
    const text = await extractPdfText(file)
    return parseLicenseText(text)
  } catch (error) {
    diagnostics.error('Лицензия парсер', 'Ошибка извлечения текста', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function parseLicenseFile(file: File): Promise<ParsedLicenseData> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  const format = ext ?? 'unknown'
  diagnostics.info('Лицензия парсер', 'Начало парсинга', { filename: file.name, format })
  try {
    if (ext === 'pdf') return await parseLicensePdf(file)
    const text = await extractText(file)
    return parseLicenseText(text)
  } catch (error) {
    diagnostics.error('Лицензия парсер', 'Ошибка извлечения текста', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

import type { ApplicationType, ParsedApplicationData } from '../types'
import { diagnostics } from './diagnostics'
import { extractPdfText, isProbablyScannedPdf } from './pdfText'

function parseDotOrIsoDate(raw: string): string {
  const trimmed = raw.trim()
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return trimmed
  const dmy = trimmed.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/)
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  const dmyTime = trimmed.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\s+(\d{1,2}:\d{2})/)
  if (dmyTime) {
    return `${dmyTime[3]}-${dmyTime[2].padStart(2, '0')}-${dmyTime[1].padStart(2, '0')}`
  }
  return trimmed
}

function extractAfterLabel(text: string, label: string, maxLen = 300): string {
  const re = new RegExp(`${label}\\s*:?\\s*([^\\n]{1,${maxLen}})`, 'i')
  return text.match(re)?.[1]?.trim().replace(/\s+/g, ' ') ?? ''
}

function detectApplicationType(text: string): ApplicationType {
  if (/Продление\s+срока\s+действия\s+лицензии/i.test(text)) return 'renewal'
  if (/Переоформление\s+лицензии/i.test(text)) return 'reissue'
  if (/Получение\s+лицензии/i.test(text)) return 'new'
  return 'new'
}

function parseDirector(text: string): {
  lastName: string
  firstName: string
  middleName: string
} {
  const section = text.match(/Сведения о руководителе[\s\S]{0,800}/i)?.[0] ?? ''
  return {
    lastName: extractAfterLabel(section, 'Фамилия', 80),
    firstName: extractAfterLabel(section, 'Имя', 80),
    middleName: extractAfterLabel(section, 'Отчество', 80),
  }
}

function parseBranches(text: string): ParsedApplicationData['branches'] {
  const branches: ParsedApplicationData['branches'] = []
  const re =
    /Место\s+осуществления\s+деятельности\s*(\d+)[\s\S]*?(?=Место\s+осуществления\s+деятельности\s*\d+|$)/gi

  for (const m of text.matchAll(re)) {
    const block = m[0]
    const kpp = extractAfterLabel(block, 'КПП', 20).replace(/\D/g, '').slice(0, 9)
    const address =
      extractAfterLabel(block, 'Адрес', 400) ||
      extractAfterLabel(block, 'место осуществления', 400)
    const cadastralNumber =
      block.match(/(?:кадастровый\s+номер)[:\s]*(\d{2}:\d{2}:\d{7}:\d+)/i)?.[1] ?? ''
    const area = extractAfterLabel(block, 'Площадь', 40)
    const additionalInfo = extractAfterLabel(block, 'Дополнительные сведения', 400)

    if (kpp || address) {
      branches.push({
        kpp,
        address,
        cadastralNumber: cadastralNumber || undefined,
        area: area || undefined,
        additionalInfo: additionalInfo || undefined,
      })
    }
  }

  return branches
}

export function parseApplicationText(text: string, options?: { log?: boolean }): ParsedApplicationData {
  const applicationType = detectApplicationType(text)

  const applicationNumber =
    extractAfterLabel(text, 'Номер заявления', 40) ||
    text.match(/Заявление\s+№\s*([^\s\n]+)/i)?.[1]?.trim() ||
    ''

  const applicationDateRaw =
    extractAfterLabel(text, 'Дата и время подачи', 40) ||
    extractAfterLabel(text, 'Дата подачи', 40)
  const applicationDate = parseDotOrIsoDate(applicationDateRaw)

  const legalAddress =
    extractAfterLabel(text, 'Адрес организации из личного кабинета ЕПГУ', 500) ||
    extractAfterLabel(text, 'Адрес организации', 500)

  const director = parseDirector(text)

  const alcoholLine = text.match(
    /оборот\s+АП\s+с\s+содержанием\s+ЭС\s+более\s+15\s+процентов[^\n]*/i,
  )?.[0]
  const alcoholOver15 = /да|true|1|имеется/i.test(alcoholLine ?? '')

  const renewalYearsRaw = extractAfterLabel(text, 'Количество лет', 10)
  const renewalYears = renewalYearsRaw ? Number(renewalYearsRaw.replace(/\D/g, '')) : undefined

  const paymentOrderNumber = extractAfterLabel(
    text,
    'Номер платежного поручения или УИН',
    80,
  )
  const paymentSection = text.match(
    /(?:платежн|госпошлин)[\s\S]{0,600}/i,
  )?.[0]
  const paymentOrderDate = paymentSection
    ? parseDotOrIsoDate(extractAfterLabel(paymentSection, 'Дата', 30))
    : ''

  const reissueReason = extractAfterLabel(text, 'Причины переоформления', 200)

  const result: ParsedApplicationData = {
    applicationType,
    applicationNumber,
    applicationDate,
    client: {
      fullName: extractAfterLabel(text, 'Полное наименование', 300),
      shortName: extractAfterLabel(text, 'Сокращённое наименование', 200),
      ogrn: extractAfterLabel(text, 'ОГРН', 20).replace(/\D/g, '').slice(0, 15),
      inn: extractAfterLabel(text, 'ИНН', 20).replace(/\D/g, '').slice(0, 12),
      kpp: extractAfterLabel(text, 'КПП', 20).replace(/\D/g, '').slice(0, 9),
      legalAddress,
      directorLastName: director.lastName,
      directorFirstName: director.firstName,
      directorMiddleName: director.middleName,
      phone: extractAfterLabel(text, 'Телефонный номер заявителя', 40),
      email: extractAfterLabel(text, 'Электронная почта заявителя', 80),
    },
    license: {
      licenseNumber: extractAfterLabel(text, 'Регистрационный номер лицензии', 40),
      licenseIssueDate: parseDotOrIsoDate(
        extractAfterLabel(text, 'Дата выдачи лицензии', 30),
      ),
      licenseActivity:
        extractAfterLabel(text, 'Конкретный вид деятельности', 300) ||
        extractAfterLabel(text, 'Вид деятельности', 300),
      alcoholOver15,
      renewalYears: renewalYears && !Number.isNaN(renewalYears) ? renewalYears : undefined,
      paymentOrderNumber: paymentOrderNumber || undefined,
      paymentOrderDate: paymentOrderDate || undefined,
      reissueReason: reissueReason || undefined,
    },
    branches: parseBranches(text),
    rawText: text.slice(0, 15000),
  }

  if (options?.log !== false) {
    diagnostics.success('Заявление Госуслуг', 'Тип заявления определён', {
      applicationType,
      applicationNumber,
    })
    diagnostics.success('Заявление Госуслуг', 'Данные заявителя извлечены', {
      fullName: result.client.fullName,
      inn: result.client.inn,
      kpp: result.client.kpp,
    })
  }

  return result
}

export async function parseApplicationPdf(file: File): Promise<ParsedApplicationData> {
  diagnostics.info('Заявление Госуслуг', 'Начало парсинга', { filename: file.name })
  try {
    const text = await extractPdfText(file)
    if (isProbablyScannedPdf(text)) {
      throw new Error(
        'Заявление является сканом — текст не извлечён. Загрузите PDF с текстовым слоем.',
      )
    }
    return parseApplicationText(text)
  } catch (error) {
    diagnostics.error('Заявление Госуслуг', 'Ошибка извлечения текста', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

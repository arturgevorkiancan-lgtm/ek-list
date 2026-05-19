import type { ParsedTechPlanData } from '../types'
import { diagnostics } from './diagnostics'
import { extractPdfText, isProbablyScannedPdf } from './pdfText'

const CADASTRAL_RE = /\b(\d{2}:\d{2}:\d{7}:\d+)\b/

function parseAreaNumber(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined
  const n = Number(String(raw).replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function getXmlText(doc: Document, tags: string[]): string | undefined {
  for (const tag of tags) {
    const nodes = doc.getElementsByTagName(tag)
    if (nodes.length > 0) {
      const t = nodes[0].textContent?.trim()
      if (t) return t
    }
  }
  return undefined
}

export function parseTechPlanXmlText(xml: string, options?: { log?: boolean }): ParsedTechPlanData {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')

  const cadastralNumber = getXmlText(doc, ['CadastralNumber', 'cadastral_number'])
  const areaRaw = getXmlText(doc, ['Area', 'S_'])
  const address =
    getXmlText(doc, ['Note']) ??
    getXmlText(doc, ['AddressOrLocation', 'Address'])
  const purpose = getXmlText(doc, ['AssignationCode', 'Appointment'])
  const floor = getXmlText(doc, ['Floors', 'Floor'])
  const roomNumber = getXmlText(doc, ['RoomNumbers', 'RoomNumber'])

  return logTechPlanResult(
    {
      cadastralNumber,
      area: parseAreaNumber(areaRaw),
      address,
      purpose,
      floor,
      roomNumber,
      format: 'xml',
    },
    options,
  )
}

export async function parseTechPlanXml(file: File): Promise<ParsedTechPlanData> {
  const xml = await file.text()
  return parseTechPlanXmlText(xml)
}

function logTechPlanResult(data: ParsedTechPlanData, options?: { log?: boolean }): ParsedTechPlanData {
  if (options?.log !== false && !data.isProbablyScan) {
    diagnostics.success('Технический план', 'Данные извлечены', {
      cadastralNumber: data.cadastralNumber,
      area: data.area,
      floor: data.floor,
      roomNumber: data.roomNumber,
      purpose: data.purpose,
    })
  }
  return data
}

export function parseTechPlanPdfText(text: string, options?: { log?: boolean }): ParsedTechPlanData {
  if (isProbablyScannedPdf(text)) {
    return { format: 'pdf', isProbablyScan: true }
  }

  const cadMatch =
    text.match(/(?:кадастровый\s+номер)[:\s]*(\d{2}:\d{2}:\d{7}:\d+)/i) ??
    text.match(CADASTRAL_RE)
  const cadastralNumber = cadMatch?.[1]

  const areaMatch = text.match(/Площадь[:\s]*([\d\s,\.]+)\s*(?:кв\.?\s*м|м²)?/i)
  const area = areaMatch ? parseAreaNumber(areaMatch[1]) : parseAreaNumber(text.match(/([\d]+[,.]?\d*)\s*кв/i)?.[1])

  const purposeMatch = text.match(
    /(?:Назначение|Вид\s+использования)[:\s]+([^\n]{3,120})/i,
  )
  const floorMatch = text.match(/Этаж[:\s]+([^\n]{1,40})/i)
  const roomMatch = text.match(
    /(?:Номер\s+помещения|Помещение\s*№)[:\s]+([^\n]{1,40})/i,
  )

  const addressMatch = text.match(/(?:Адрес|местоположение)[:\s]+([^\n]{10,300})/i)

  return logTechPlanResult(
    {
      cadastralNumber,
      area,
      address: addressMatch?.[1]?.trim().replace(/\s+/g, ' '),
      purpose: purposeMatch?.[1]?.trim(),
      floor: floorMatch?.[1]?.trim(),
      roomNumber: roomMatch?.[1]?.trim(),
      format: 'pdf',
      isProbablyScan: false,
    },
    options,
  )
}

export async function parseTechPlanPdf(file: File): Promise<ParsedTechPlanData> {
  const text = await extractPdfText(file)
  return parseTechPlanPdfText(text)
}

export async function parseTechPlanFile(file: File): Promise<ParsedTechPlanData> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  const format = ext ?? 'unknown'
  diagnostics.info('Технический план', 'Начало парсинга', { filename: file.name, format })
  try {
    if (ext === 'xml') return await parseTechPlanXml(file)
    if (ext === 'pdf') return await parseTechPlanPdf(file)
    throw new Error('Технический план: поддерживаются PDF и XML')
  } catch (error) {
    diagnostics.error('Технический план', 'Ошибка извлечения текста', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

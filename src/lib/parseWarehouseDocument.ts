import { parseEGRNFile, parseEGRNText } from './egrnParser'
import { parseOPNotificationPdf, parseOPNotificationText } from './opNotificationParser'
import { extractPdfText } from './pdfText'
import {
  parseTechPlanFile,
  parseTechPlanPdfText,
  parseTechPlanXmlText,
} from './techPlanParser'
import type { ParsedEGRN, ParsedOPNotification, ParsedTechPlanData } from '../types'

export interface ParsedWarehouseDocumentFields {
  address?: string
  area?: string | number | null
  cadastral_number?: string | null
  purpose?: string | null
  floor?: string | null
}

function fromEgrn(parsed: ParsedEGRN): ParsedWarehouseDocumentFields {
  return {
    address: parsed.address || undefined,
    area: parsed.area ?? null,
    cadastral_number: parsed.cadastralNumber || null,
    purpose: parsed.rightType || null,
    floor: null,
  }
}

function fromTechPlan(parsed: ParsedTechPlanData): ParsedWarehouseDocumentFields {
  return {
    address: parsed.address,
    area: parsed.area ?? null,
    cadastral_number: parsed.cadastralNumber ?? null,
    purpose: parsed.purpose ?? null,
    floor: parsed.floor ?? null,
  }
}

function fromOp(parsed: ParsedOPNotification): ParsedWarehouseDocumentFields {
  return {
    address: parsed.opAddress || undefined,
    area: null,
    cadastral_number: null,
    purpose: null,
    floor: null,
  }
}

function isTechPlanText(text: string): boolean {
  return /технический\s+план|techplan|cadastralnumber/i.test(text)
}

function isEgrnText(text: string): boolean {
  return /выписка\s+из\s+единого\s+государственного\s+реестра\s+недвижимости|кадастровый\s+(?:номер|№)/i.test(
    text,
  )
}

function isEgrylText(text: string): boolean {
  return /выписка\s+из\s+единого\s+государственного\s+реестра\s+юридических\s+лиц|егрюл|адрес\s+юридического\s+лица/i.test(
    text,
  )
}

function isOpText(text: string): boolean {
  return /уведомление|поставлен[аоы]?\s+на\s+учет|обособленного\s+подразделения/i.test(
    text,
  )
}

async function parsePdfByContent(file: File): Promise<ParsedWarehouseDocumentFields> {
  const text = await extractPdfText(file)
  if (isEgrylText(text) && !isEgrnText(text)) {
    throw new Error(
      'Это выписка ЕГРЮЛ. Загрузите её в блоке «Документы организации» — адрес пойдёт только в реквизиты клиента.',
    )
  }
  if (isTechPlanText(text) && !isEgrnText(text)) {
    return fromTechPlan(await parseTechPlanFile(file))
  }
  if (isOpText(text) && !isEgrnText(text) && !/кадастровый/i.test(text)) {
    return fromOp(await parseOPNotificationPdf(file))
  }
  return fromEgrn(await parseEGRNFile(file))
}

/** Определяет тип документа и извлекает поля склада (парсеры без изменений). */
export async function parseWarehouseDocumentFile(
  file: File,
): Promise<ParsedWarehouseDocumentFields> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'xml') {
    return fromTechPlan(await parseTechPlanFile(file))
  }

  if (ext === 'txt') {
    const text = await file.text()
    if (isEgrylText(text) && !isEgrnText(text)) {
      throw new Error(
        'Это выписка ЕГРЮЛ. Загрузите её в блоке «Документы организации» — адрес пойдёт только в реквизиты клиента.',
      )
    }
    if (text.trim().startsWith('<')) {
      return fromTechPlan(parseTechPlanXmlText(text))
    }
    if (isTechPlanText(text)) return fromTechPlan(parseTechPlanPdfText(text))
    if (isOpText(text) && !isEgrnText(text)) return fromOp(parseOPNotificationText(text))
    return fromEgrn(parseEGRNText(text))
  }

  if (ext === 'pdf') {
    return parsePdfByContent(file)
  }

  throw new Error('Поддерживаются файлы .pdf, .xml и .txt')
}

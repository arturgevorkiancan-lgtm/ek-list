import { parseEGRYLPdf, parseEGRYLText } from './egrnParser'
import { sanitizeEgrulLegalAddress } from './egrulAddress'
import type { ParsedEGRYLData } from '../types'

/** Parse ЕГРЮЛ upload (PDF or XML). Только реквизиты клиента — warehouses.address не затрагивается. */
export async function parseEgrylUploadFile(file: File): Promise<ParsedEGRYLData> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  let parsed: ParsedEGRYLData
  if (ext === 'pdf') parsed = await parseEGRYLPdf(file)
  else if (ext === 'xml') {
    const text = await file.text()
    parsed = parseEGRYLText(text)
  } else {
    throw new Error('Поддерживаются форматы PDF и XML')
  }

  const legal = sanitizeEgrulLegalAddress(parsed.client.legalAddress)
  return {
    ...parsed,
    client: {
      ...parsed.client,
      legalAddress: legal,
    },
  }
}

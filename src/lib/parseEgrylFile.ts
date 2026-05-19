import { parseEGRYLPdf, parseEGRYLText } from './egrnParser'
import type { ParsedEGRYLData } from '../types'

/** Parse ЕГРЮЛ upload (PDF or XML) using existing egrnParser exports. */
export async function parseEgrylUploadFile(file: File): Promise<ParsedEGRYLData> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return parseEGRYLPdf(file)
  if (ext === 'xml') {
    const text = await file.text()
    return parseEGRYLText(text)
  }
  throw new Error('Поддерживаются форматы PDF и XML')
}

import * as pdfjs from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export const SCAN_TEXT_THRESHOLD = 100

export async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(
      content.items.map((item) => ('str' in item ? item.str : '')).join(' '),
    )
  }
  return pages.join('\n')
}

export function isProbablyScannedPdf(text: string): boolean {
  return text.replace(/\s/g, '').length < SCAN_TEXT_THRESHOLD
}

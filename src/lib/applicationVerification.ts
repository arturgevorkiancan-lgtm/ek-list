import type {
  Client,
  License,
  LicenseAddressJson,
  ParsedApplicationData,
  VerificationResult,
  VerificationStatus,
} from '../types'

function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toUpperCase()
}

function normDigits(s: string): string {
  return s.replace(/\D/g, '')
}

function normDate(s: string): string {
  const t = s.trim()
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return t
  const dmy = t.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return t
}

const REGION_ALIASES: Array<[RegExp, string]> = [
  [/\bМО\b/g, 'МОСКОВСКАЯ ОБЛАСТЬ'],
  [/МОСКОВСКАЯ\s+ОБЛ/g, 'МОСКОВСКАЯ ОБЛАСТЬ'],
  [/ОБЛ\.?\s*МОСКОВСКАЯ/g, 'МОСКОВСКАЯ ОБЛАСТЬ'],
  [/Г\.?\s*МОСКВА/g, 'МОСКВА'],
]

function normalizeAddressForCompare(s: string): string {
  let v = norm(s)
  for (const [re, rep] of REGION_ALIASES) {
    v = v.replace(re, rep)
  }
  return v.replace(/,+/g, ',').replace(/\s*,\s*/g, ',')
}

function compareScalar(
  field: string,
  fieldKey: string,
  our: string,
  app: string,
  mode: 'text' | 'digits' | 'date' | 'address',
): VerificationResult | null {
  const ourTrim = our.trim()
  const appTrim = app.trim()
  if (!ourTrim && !appTrim) return null
  if (ourTrim && !appTrim) {
    return {
      field,
      fieldKey,
      ourValue: ourTrim,
      applicationValue: '—',
      status: 'missing',
    }
  }
  if (!ourTrim && appTrim) {
    return {
      field,
      fieldKey,
      ourValue: '—',
      applicationValue: appTrim,
      status: 'warning',
    }
  }

  let status: VerificationStatus = 'error'
  if (mode === 'digits') {
    status = normDigits(ourTrim) === normDigits(appTrim) ? 'ok' : 'error'
  } else if (mode === 'date') {
    status = normDate(ourTrim) === normDate(appTrim) ? 'ok' : 'error'
  } else if (mode === 'address') {
    const a = normalizeAddressForCompare(ourTrim)
    const b = normalizeAddressForCompare(appTrim)
    if (a === b) status = 'ok'
    else if (a.includes(b) || b.includes(a) || levenshteinRatio(a, b) > 0.85) {
      status = 'warning'
    } else {
      status = 'error'
    }
  } else {
    const a = norm(ourTrim)
    const b = norm(appTrim)
    if (a === b) status = 'ok'
    else if (a.includes(b) || b.includes(a)) status = 'warning'
    else status = 'error'
  }

  return {
    field,
    fieldKey,
    ourValue: ourTrim,
    applicationValue: appTrim,
    status,
  }
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  const dist = matrix[b.length][a.length]
  return 1 - dist / Math.max(a.length, b.length)
}

export function buildVerificationResults(
  client: Client,
  license: License | null,
  branches: LicenseAddressJson[],
  app: ParsedApplicationData,
): VerificationResult[] {
  const results: VerificationResult[] = []

  const push = (r: VerificationResult | null) => {
    if (r) results.push(r)
  }

  push(
    compareScalar('ИНН', 'inn', client.inn ?? '', app.client.inn, 'digits'),
  )
  push(
    compareScalar('КПП', 'kpp', client.kpp ?? '', app.client.kpp, 'digits'),
  )
  push(
    compareScalar('ОГРН', 'ogrn', client.ogrn ?? '', app.client.ogrn, 'digits'),
  )
  push(
    compareScalar(
      'Полное наименование',
      'fullName',
      client.name ?? '',
      app.client.fullName,
      'text',
    ),
  )
  push(
    compareScalar(
      'Адрес юр.лица',
      'legalAddress',
      client.legal_address ?? '',
      app.client.legalAddress,
      'address',
    ),
  )
  push(
    compareScalar(
      'Номер лицензии',
      'licenseNumber',
      license?.license_number ?? '',
      app.license.licenseNumber,
      'text',
    ),
  )
  push(
    compareScalar(
      'Дата выдачи лицензии',
      'licenseIssueDate',
      license?.issue_date ?? '',
      app.license.licenseIssueDate,
      'date',
    ),
  )
  push(
    compareScalar(
      'Вид деятельности',
      'licenseActivity',
      license?.license_activity ?? '',
      app.license.licenseActivity,
      'text',
    ),
  )

  for (const appBranch of app.branches) {
    const ourBranch = branches.find((b) => b.kpp === appBranch.kpp)
    const label = appBranch.kpp ? `КПП (${appBranch.kpp})` : 'КПП филиала'

    push(
      compareScalar(
        label,
        `branchKpp:${appBranch.kpp}`,
        ourBranch?.kpp ?? '',
        appBranch.kpp,
        'digits',
      ),
    )
    push(
      compareScalar(
        `Адрес (${appBranch.kpp || 'филиал'})`,
        `branchAddr:${appBranch.kpp}`,
        ourBranch?.address ?? '',
        appBranch.address,
        'address',
      ),
    )
    if (appBranch.cadastralNumber || ourBranch?.cadastral_number) {
      push(
        compareScalar(
          `Кадастр (${appBranch.kpp || 'филиал'})`,
          `branchCad:${appBranch.kpp}`,
          ourBranch?.cadastral_number ?? '',
          appBranch.cadastralNumber ?? '',
          'text',
        ),
      )
    }
    if (appBranch.area || ourBranch?.area_sqm) {
      push(
        compareScalar(
          `Площадь (${appBranch.kpp || 'филиал'})`,
          `branchArea:${appBranch.kpp}`,
          String(ourBranch?.area_sqm ?? ''),
          appBranch.area ?? '',
          'text',
        ),
      )
    }
  }

  for (const ourBranch of branches) {
    if (ourBranch.kpp && !app.branches.some((b) => b.kpp === ourBranch.kpp)) {
      push({
        field: `КПП (${ourBranch.kpp})`,
        fieldKey: `branchKpp:${ourBranch.kpp}`,
        ourValue: ourBranch.kpp,
        applicationValue: '—',
        status: 'missing',
      })
    }
  }

  return results
}

export function summarizeVerification(results: VerificationResult[]) {
  const ok = results.filter((r) => r.status === 'ok').length
  const warnings = results.filter((r) => r.status === 'warning').length
  const errors = results.filter((r) => r.status === 'error').length
  const missing = results.filter((r) => r.status === 'missing').length
  return {
    total: results.length,
    ok,
    warnings,
    errors,
    missing,
    discrepancies: warnings + errors + missing,
  }
}

export const APPLICATION_TYPE_TO_OPERATION: Record<
  ParsedApplicationData['applicationType'],
  'ПРОДЛЕНИЕ' | 'ПОЛУЧЕНИЕ' | 'ПЕРЕОФОРМЛЕНИЕ'
> = {
  renewal: 'ПРОДЛЕНИЕ',
  new: 'ПОЛУЧЕНИЕ',
  reissue: 'ПЕРЕОФОРМЛЕНИЕ',
}

export const APPLICATION_TYPE_LABELS: Record<ParsedApplicationData['applicationType'], string> = {
  renewal: 'продление',
  new: 'получение',
  reissue: 'переоформление',
}

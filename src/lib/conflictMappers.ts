import type { Dispatch, SetStateAction } from 'react'
import type { DataSource, ConsolidatedData } from './conflictDetector'
import {
  SOURCE_APPLICATION,
  SOURCE_EGRYL,
  SOURCE_RATK,
  SOURCE_REGISTRY,
} from './conflictDetector.constants'
import type {
  ParsedApplicationData,
  ParsedEGRYLData,
  ParsedLicenseData,
  ParsedOPNotification,
} from '../types'
import { SOURCE_OP_NOTIFICATION } from './conflictDetector.constants'

export { SOURCE_APPLICATION, SOURCE_EGRYL, SOURCE_RATK, SOURCE_REGISTRY }

export function egrylToDataSource(data: ParsedEGRYLData, sourceDate?: string): DataSource {
  const consolidated: Partial<ConsolidatedData> = {
    fullName: data.client.fullName || undefined,
    shortName: data.client.shortName || undefined,
    inn: data.client.inn || undefined,
    kpp: data.client.kpp || undefined,
    ogrn: data.client.ogrn || undefined,
    legalAddress: data.client.legalAddress || undefined,
  }
  if (data.license) {
    consolidated.licenseNumber = data.license.licenseNumber || undefined
    consolidated.issueDate = data.license.issueDate || undefined
    consolidated.expiryDate = data.license.expiryDate || undefined
    consolidated.licenseActivity = data.license.licenseActivity || undefined
  }
  return { sourceName: SOURCE_EGRYL, sourceDate, data: consolidated }
}

export function applicationToDataSource(
  data: ParsedApplicationData,
  sourceDate?: string,
): DataSource {
  return {
    sourceName: SOURCE_APPLICATION,
    sourceDate: sourceDate ?? data.applicationDate,
    data: {
      fullName: data.client.fullName || undefined,
      shortName: data.client.shortName || undefined,
      inn: data.client.inn || undefined,
      kpp: data.client.kpp || undefined,
      ogrn: data.client.ogrn || undefined,
      legalAddress: data.client.legalAddress || undefined,
      licenseNumber: data.license.licenseNumber || undefined,
      issueDate: data.license.licenseIssueDate || undefined,
      licenseActivity: data.license.licenseActivity || undefined,
      branches: data.branches.length > 0 ? data.branches : undefined,
    },
  }
}

export function opNotificationToDataSource(
  data: ParsedOPNotification,
  sourceDate?: string,
): DataSource {
  const branches: Array<{ kpp: string; address: string }> = []
  if (data.kppOP) {
    branches.push({ kpp: data.kppOP, address: data.opAddress || '—' })
  }
  return {
    sourceName: SOURCE_OP_NOTIFICATION,
    sourceDate,
    data: {
      fullName: data.organizationName || undefined,
      inn: data.inn || undefined,
      kpp: data.kppMain || undefined,
      ogrn: data.ogrn || undefined,
      branches: branches.length ? branches : undefined,
    },
  }
}

export function licenseToDataSource(data: ParsedLicenseData, sourceDate?: string): DataSource {
  const sourceName =
    data.format === 'ratk_extract' ? SOURCE_RATK : SOURCE_REGISTRY

  return {
    sourceName,
    sourceDate,
    data: {
      fullName: data.fullName || undefined,
      inn: data.inn || undefined,
      kpp: data.kpp || undefined,
      legalAddress: data.legalAddress || undefined,
      licenseNumber: data.licenseNumber || undefined,
      issueDate: data.issueDate || undefined,
      expiryDate: data.expiryDate || undefined,
      licenseActivity: data.licenseActivity || undefined,
      branches: data.branches.length > 0 ? data.branches : undefined,
    },
  }
}

export function mergedToEgrylForm(
  merged: ConsolidatedData,
  prev: ParsedEGRYLData,
): ParsedEGRYLData {
  return {
    ...prev,
    client: {
      ...prev.client,
      fullName: merged.fullName ?? prev.client.fullName,
      shortName: merged.shortName ?? prev.client.shortName,
      inn: merged.inn ?? prev.client.inn,
      kpp: merged.kpp ?? prev.client.kpp,
      ogrn: merged.ogrn ?? prev.client.ogrn,
      legalAddress: merged.legalAddress ?? prev.client.legalAddress,
    },
    license: prev.license
      ? {
          ...prev.license,
          licenseNumber: merged.licenseNumber ?? prev.license.licenseNumber,
          issueDate: merged.issueDate ?? prev.license.issueDate,
          expiryDate: merged.expiryDate ?? prev.license.expiryDate,
          licenseActivity: merged.licenseActivity ?? prev.license.licenseActivity,
        }
      : merged.licenseNumber
        ? {
            licenseNumber: merged.licenseNumber ?? '',
            issueDate: merged.issueDate ?? '',
            expiryDate: merged.expiryDate ?? '',
            licenseActivity: merged.licenseActivity ?? '',
            licenseAuthority: '',
          }
        : undefined,
  }
}

export function mergedToLicenseForm(
  merged: ConsolidatedData,
  prev: ParsedLicenseData,
): ParsedLicenseData {
  return {
    ...prev,
    licenseNumber: merged.licenseNumber ?? prev.licenseNumber,
    issueDate: merged.issueDate ?? prev.issueDate,
    expiryDate: merged.expiryDate ?? prev.expiryDate,
    fullName: merged.fullName ?? prev.fullName,
    inn: merged.inn ?? prev.inn,
    kpp: merged.kpp ?? prev.kpp,
    legalAddress: merged.legalAddress ?? prev.legalAddress,
    licenseActivity: merged.licenseActivity ?? prev.licenseActivity,
    branches: merged.branches?.length ? merged.branches : prev.branches,
  }
}

export function applyFieldToEgryl(
  key: string,
  value: string,
  setForm: Dispatch<SetStateAction<ParsedEGRYLData>>,
) {
  if (key.startsWith('branch:')) return
  setForm((f) => {
    switch (key) {
      case 'fullName':
        return { ...f, client: { ...f.client, fullName: value } }
      case 'shortName':
        return { ...f, client: { ...f.client, shortName: value } }
      case 'inn':
        return { ...f, client: { ...f.client, inn: value } }
      case 'kpp':
        return { ...f, client: { ...f.client, kpp: value } }
      case 'ogrn':
        return { ...f, client: { ...f.client, ogrn: value } }
      case 'legalAddress':
        return { ...f, client: { ...f.client, legalAddress: value } }
      case 'licenseNumber':
        return f.license
          ? { ...f, license: { ...f.license, licenseNumber: value } }
          : {
              ...f,
              license: {
                licenseNumber: value,
                issueDate: '',
                expiryDate: '',
                licenseActivity: '',
                licenseAuthority: '',
              },
            }
      case 'issueDate':
        return f.license
          ? { ...f, license: { ...f.license, issueDate: value } }
          : f
      case 'expiryDate':
        return f.license
          ? { ...f, license: { ...f.license, expiryDate: value } }
          : f
      case 'licenseActivity':
        return f.license
          ? { ...f, license: { ...f.license, licenseActivity: value } }
          : f
      default:
        return f
    }
  })
}

export function applyFieldToLicense(
  key: string,
  value: string,
  setForm: Dispatch<SetStateAction<ParsedLicenseData>>,
) {
  if (key.startsWith('branch:')) {
    const kpp = key.slice('branch:'.length)
    setForm((f) => {
      const idx = f.branches.findIndex((b) => b.kpp === kpp)
      const branches = [...f.branches]
      if (idx >= 0) {
        branches[idx] = { ...branches[idx], address: value }
      } else {
        branches.push({ kpp, address: value })
      }
      return { ...f, branches }
    })
    return
  }
  setForm((f) => {
    switch (key) {
      case 'fullName':
        return { ...f, fullName: value }
      case 'inn':
        return { ...f, inn: value }
      case 'kpp':
        return { ...f, kpp: value }
      case 'legalAddress':
        return { ...f, legalAddress: value }
      case 'licenseNumber':
        return { ...f, licenseNumber: value }
      case 'issueDate':
        return { ...f, issueDate: value }
      case 'expiryDate':
        return { ...f, expiryDate: value }
      case 'licenseActivity':
        return { ...f, licenseActivity: value }
      default:
        return f
    }
  })
}

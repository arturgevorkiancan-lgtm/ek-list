export type DiagnosticLevel = 'info' | 'warn' | 'error' | 'success'

export interface DiagnosticEntry {
  timestamp: string
  level: DiagnosticLevel
  category: string
  message: string
  details?: Record<string, unknown>
}

type DiagnosticsListener = () => void

import { isSupabaseConfigured } from './supabase'

let storageMode: 'supabase' | 'local' = isSupabaseConfigured ? 'supabase' : 'local'
let lastStorageUploadOk = false

export function setDiagnosticsStorageMode(mode: 'supabase' | 'local', uploadSucceeded?: boolean): void {
  storageMode = mode
  if (uploadSucceeded !== undefined) lastStorageUploadOk = uploadSucceeded
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatExportDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function levelTag(level: DiagnosticLevel): string {
  return level.toUpperCase().padEnd(7, ' ')
}

function formatDetailsForExport(details: Record<string, unknown> | undefined): string {
  if (!details || Object.keys(details).length === 0) return ''
  const lines: string[] = []
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      lines.push(`  ${key}: ${value.map(String).join(', ')}`)
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v !== undefined && v !== null && v !== '') lines.push(`  ${k}: ${String(v)}`)
      }
    } else {
      lines.push(`  ${key}: ${String(value)}`)
    }
  }
  return lines.length ? '\n' + lines.join('\n') : ''
}

function resolveClientNameFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const m = window.location.pathname.match(/\/clients\/([^/]+)/)
  if (!m) return undefined
  try {
    const raw = sessionStorage.getItem(`ek-client-name:${m[1]}`)
    return raw ?? undefined
  } catch {
    return undefined
  }
}

export function setDiagnosticsClientName(clientId: string, name: string): void {
  try {
    sessionStorage.setItem(`ek-client-name:${clientId}`, name)
  } catch {
    /* ignore */
  }
}

class DiagnosticsLog {
  private entries: DiagnosticEntry[] = []
  private maxEntries = 500
  private listeners = new Set<DiagnosticsListener>()
  private snapshot: DiagnosticEntry[] = []
  private snapshotDirty = true

  subscribe = (listener: DiagnosticsListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): DiagnosticEntry[] => {
    if (this.snapshotDirty) {
      this.snapshot = [...this.entries]
      this.snapshotDirty = false
    }
    return this.snapshot
  }

  private notify(): void {
    for (const l of this.listeners) l()
  }

  log(
    level: DiagnosticLevel,
    category: string,
    message: string,
    details?: Record<string, unknown>,
  ): void {
    const entry: DiagnosticEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details,
    }
    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
    this.snapshotDirty = true
    this.notify()
  }

  info(category: string, message: string, details?: Record<string, unknown>): void {
    this.log('info', category, message, details)
  }

  warn(category: string, message: string, details?: Record<string, unknown>): void {
    this.log('warn', category, message, details)
  }

  error(category: string, message: string, details?: Record<string, unknown>): void {
    this.log('error', category, message, details)
  }

  success(category: string, message: string, details?: Record<string, unknown>): void {
    this.log('success', category, message, details)
  }

  getEntries(): DiagnosticEntry[] {
    return [...this.entries]
  }

  getErrorCount(): number {
    return this.entries.filter((e) => e.level === 'error').length
  }

  clear(): void {
    this.entries = []
    this.snapshotDirty = true
    this.notify()
  }

  exportTxt(clientName?: string): string {
    const now = new Date().toISOString()
    const entries = this.entries
    const errorCount = entries.filter((e) => e.level === 'error').length
    const warnCount = entries.filter((e) => e.level === 'warn').length

    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
    const urlPreview = supabaseUrl ? supabaseUrl.slice(0, 20) + (supabaseUrl.length > 20 ? '...' : '') : '—'
    const mode =
      storageMode === 'supabase' && lastStorageUploadOk
        ? 'Supabase'
        : storageMode === 'supabase'
          ? 'Supabase (загрузки с fallback)'
          : 'локальный'

    const resolvedClient = clientName ?? resolveClientNameFromUrl()

    const header = [
      '=== ЧЕК-Лист Диагностика ===',
      `Дата экспорта: ${formatExportDate(now)}`,
      `Браузер: ${typeof navigator !== 'undefined' ? navigator.userAgent : '—'}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : '—'}`,
      resolvedClient ? `Клиент: ${resolvedClient}` : undefined,
      `Всего записей: ${entries.length}`,
      `Ошибок: ${errorCount}`,
      `Предупреждений: ${warnCount}`,
      '================================',
      '',
      '=== ЗАПИСИ ===',
    ]
      .filter(Boolean)
      .join('\n')

    const body = entries
      .map((e) => {
        const line = `[${formatTimeShort(e.timestamp)}] [${levelTag(e.level)}] [${e.category}] ${e.message}`
        return line + formatDetailsForExport(e.details)
      })
      .join('\n\n')

    const footer = [
      '',
      '=== СОСТОЯНИЕ ПРИЛОЖЕНИЯ ===',
      `Supabase URL: ${urlPreview}`,
      `Storage bucket: documents`,
      `Режим: ${mode}`,
    ].join('\n')

    return `${header}\n${body}${footer}`
  }

  downloadTxt(clientName?: string): void {
    const text = this.exportTxt(clientName)
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const filename = `чек-лист-диагностика-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.txt`
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}

export const diagnostics = new DiagnosticsLog()

export { formatTimeShort, formatTimestamp }

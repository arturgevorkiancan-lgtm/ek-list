import { useCallback, useMemo, useState } from 'react'
import {
  detectConflicts,
  formatSourceBadge,
  type ConflictItem,
  type ConsolidatedData,
  type DataSource,
} from '../lib/conflictDetector'

export type FieldSourceMap = Record<string, 'manual' | string>

export type ConflictSelections = Record<string, { sourceName: string; value: string }>

function buildInitialSelections(conflicts: ConflictItem[]): ConflictSelections {
  const selections: ConflictSelections = {}
  for (const c of conflicts) {
    const def = c.values[0]
    if (def) selections[c.fieldKey] = { sourceName: def.sourceName, value: def.value }
  }
  return selections
}

export function useDocumentConflicts(
  parsedSources: DataSource[],
  setParsedSources: React.Dispatch<React.SetStateAction<DataSource[]>>,
) {
  const [selections, setSelections] = useState<ConflictSelections>({})
  const [fieldSources, setFieldSources] = useState<FieldSourceMap>({})
  const [manualOverrides, setManualOverrides] = useState<Set<string>>(new Set())

  const { conflicts, merged } = useMemo(() => detectConflicts(parsedSources), [parsedSources])

  const addSource = useCallback(
    (source: DataSource, onMerged?: (merged: ConsolidatedData) => void) => {
      setParsedSources((prev) => {
        const next = [...prev, source]
        const result = detectConflicts(next)
        setSelections(buildInitialSelections(result.conflicts))
        const sources: FieldSourceMap = {}
        for (const c of result.conflicts) {
          const def = c.values[0]
          if (def) sources[c.fieldKey] = def.sourceName
        }
        setFieldSources(sources)
        setManualOverrides(new Set())
        onMerged?.(result.merged)
        return next
      })
    },
    [setParsedSources],
  )

  const resetSources = useCallback(() => {
    setParsedSources([])
    setSelections({})
    setFieldSources({})
    setManualOverrides(new Set())
  }, [setParsedSources])

  const handleConflictSelect = useCallback((key: string, value: string) => {
    setSelections((s) => {
      const conflict = conflicts.find((c) => c.fieldKey === key)
      const match = conflict?.values.find((v) => v.value === value)
      return {
        ...s,
        [key]: {
          sourceName: match?.sourceName ?? s[key]?.sourceName ?? '',
          value,
        },
      }
    })
    setFieldSources((f) => {
      const conflict = conflicts.find((c) => c.fieldKey === key)
      const match = conflict?.values.find((v) => v.value === value)
      return { ...f, [key]: match?.sourceName ?? f[key] ?? '' }
    })
    setManualOverrides((m) => {
      const next = new Set(m)
      next.delete(key)
      return next
    })
  }, [conflicts])

  const markManual = useCallback((key: string) => {
    setFieldSources((f) => ({ ...f, [key]: 'manual' }))
    setManualOverrides((m) => new Set(m).add(key))
  }, [])

  const isUnresolved = useCallback(
    (key: string) => {
      if (conflicts.length === 0) return false
      const hasConflict = conflicts.some((c) => c.fieldKey === key)
      if (!hasConflict) return false
      return !selections[key] && !manualOverrides.has(key)
    },
    [conflicts, selections, manualOverrides],
  )

  const getBadge = useCallback(
    (key: string) => {
      const src = fieldSources[key]
      if (!src) return null
      return formatSourceBadge(src === 'manual' ? 'manual' : src)
    },
    [fieldSources],
  )

  const selectedByField = useMemo(() => {
    const map: Record<string, string> = {}
    for (const [key, sel] of Object.entries(selections)) {
      map[key] = sel.value
    }
    return map
  }, [selections])

  const unresolvedFieldKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const c of conflicts) {
      if (!selections[c.fieldKey] && !manualOverrides.has(c.fieldKey)) {
        keys.add(c.fieldKey)
      }
    }
    return keys
  }, [conflicts, selections, manualOverrides])

  const applyMergedToForm = useCallback(
    <T>(apply: (merged: ConsolidatedData) => T): T | null => {
      if (parsedSources.length === 0) return null
      return apply(merged)
    },
    [parsedSources.length, merged],
  )

  return {
    parsedSources,
    conflicts,
    merged,
    selections,
    selectedByField,
    unresolvedFieldKeys,
    manualOverrides,
    addSource,
    resetSources,
    handleConflictSelect,
    markManual,
    isUnresolved,
    getBadge,
    applyMergedToForm,
    hasConflicts: conflicts.length > 0,
  }
}

import {
  assignValuesToPair,
  buildSourceSnapshotsFromDocs,
  canonicalSourcePair,
  fieldsForScope,
  pickPriorityValue,
  type ConflictField,
  type ConflictFieldMap,
  type ConflictSourceKey,
} from './conflictSourceData'
import { getConflictLevel } from './conflictLevels'
import {
  loadConflictContext,
  loadExistingConflicts,
  upsertDataConflict,
  getSourcePriorityOrder,
} from './conflictApi'
import type { DataConflict } from '../types'
import { uid } from './localStore'

export function normalizeForConflictCompare(value: string): string {
  return value.trim().toLowerCase()
}

export function valuesConflict(a: string, b: string): boolean {
  return normalizeForConflictCompare(a) !== normalizeForConflictCompare(b)
}

export interface DetectConflictsParams {
  clientId: string
  warehouseId?: string | null
  newData: ConflictFieldMap
  newSource: ConflictSourceKey
}

export interface DetectConflictsResult {
  createdOrUpdated: DataConflict[]
  reopenedResolved: number
  hasUnresolved: boolean
}

export async function detectAndSaveConflicts(
  params: DetectConflictsParams,
): Promise<DetectConflictsResult> {
  const { clientId, warehouseId = null, newData, newSource } = params
  const scopeFields = fieldsForScope(warehouseId)
  const { client, license, docs, warehouse } = await loadConflictContext(
    clientId,
    warehouseId,
  )

  const snapshots = buildSourceSnapshotsFromDocs(docs, {
    client,
    license,
    warehouse,
    warehouseId,
  })
  snapshots.set(newSource, { ...(snapshots.get(newSource) ?? {}), ...newData })

  const existingList = await loadExistingConflicts(clientId, warehouseId)
  const createdOrUpdated: DataConflict[] = []
  let reopenedResolved = 0

  for (const field of scopeFields) {
    const newValue = newData[field]?.trim()
    if (!newValue) continue

    for (const [otherSource, otherFields] of snapshots) {
      if (otherSource === newSource) continue
      const otherValue = otherFields[field]?.trim()
      if (!otherValue) continue
      if (!valuesConflict(newValue, otherValue)) continue

      const { sourceA, sourceB, valueA, valueB } = assignValuesToPair(
        newSource,
        newValue,
        otherSource,
        otherValue,
      )

      const level = getConflictLevel(field)
      const priorityOrder = await getSourcePriorityOrder(clientId, field)
      const priorityPick = pickPriorityValue(newData, priorityOrder, snapshots, field)

      const existing = existingList.find(
        (c) =>
          c.field === field &&
          c.source_a === sourceA &&
          c.source_b === sourceB,
      )

      const wasResolved = existing?.resolved === true
      const previousPriorityValue =
        existing?.resolved && existing.priority_source
          ? existing.priority_source === sourceA
            ? existing.value_a
            : existing.priority_source === sourceB
              ? existing.value_b
              : null
          : null

      const newSourceValue =
        newSource === sourceA ? valueA : newSource === sourceB ? valueB : newValue

      const priorityValueChanged =
        wasResolved &&
        previousPriorityValue != null &&
        valuesConflict(previousPriorityValue, newSourceValue ?? newValue)

      const row: DataConflict = {
        id: existing?.id ?? uid(),
        client_id: clientId,
        warehouse_id: warehouseId,
        field,
        source_a: sourceA,
        value_a: valueA,
        source_b: sourceB,
        value_b: valueB,
        priority_source: priorityPick?.source ?? existing?.priority_source ?? null,
        level,
        resolved: priorityValueChanged ? false : (existing?.resolved ?? false),
        resolved_at: priorityValueChanged ? null : (existing?.resolved_at ?? null),
        resolution_comment: priorityValueChanged
          ? null
          : (existing?.resolution_comment ?? null),
        created_at: existing?.created_at ?? new Date().toISOString(),
      }

      if (wasResolved && (priorityValueChanged || !existing)) {
        reopenedResolved += 1
      } else if (existing && !wasResolved) {
        row.resolved = false
      }

      const saved = await upsertDataConflict(row)
      createdOrUpdated.push(saved)

      if (existing) {
        const idx = existingList.findIndex((c) => c.id === existing.id)
        if (idx >= 0) existingList[idx] = saved
        else existingList.push(saved)
      } else {
        existingList.push(saved)
      }
    }
  }

  for (const existing of existingList) {
    if (!existing.resolved || !existing.priority_source) continue
    const involvesNewSource =
      existing.source_a === newSource || existing.source_b === newSource
    if (!involvesNewSource) continue

    const newSourceValue =
      existing.source_a === newSource
        ? newData[existing.field as ConflictField] ?? existing.value_a
        : existing.source_b === newSource
          ? newData[existing.field as ConflictField] ?? existing.value_b
          : null

    if (!newSourceValue?.trim()) continue

    const prevChosen =
      existing.priority_source === existing.source_a
        ? existing.value_a
        : existing.value_b

    if (
      prevChosen &&
      valuesConflict(prevChosen, newSourceValue) &&
      existing.priority_source === newSource
    ) {
      const reopened = await upsertDataConflict({
        ...existing,
        resolved: false,
        resolved_at: null,
        resolution_comment: null,
        value_a:
          existing.source_a === newSource ? newSourceValue : existing.value_a,
        value_b:
          existing.source_b === newSource ? newSourceValue : existing.value_b,
      })
      reopenedResolved += 1
      const idx = createdOrUpdated.findIndex((c) => c.id === reopened.id)
      if (idx >= 0) createdOrUpdated[idx] = reopened
      else createdOrUpdated.push(reopened)
    }
  }

  const hasUnresolved = createdOrUpdated.some((c) => !c.resolved)

  return { createdOrUpdated, reopenedResolved, hasUnresolved }
}

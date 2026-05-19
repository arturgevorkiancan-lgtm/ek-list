import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchDataConflicts,
  fetchUnresolvedConflictCount,
  resolveDataConflict,
} from '../lib/conflictApi'
import type { DataConflict, DataConflictSource } from '../types'

const OPEN_EVENT = 'conflicts:open'

export function useDataConflicts(clientId: string | undefined) {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [warehouseFilter, setWarehouseFilter] = useState<string | null | undefined>(
    undefined,
  )

  const { data: conflicts = [], refetch } = useQuery({
    queryKey: ['data-conflicts', clientId, warehouseFilter],
    queryFn: () =>
      clientId
        ? fetchDataConflicts(clientId, {
            warehouseId: warehouseFilter,
            unresolvedOnly: false,
          })
        : Promise.resolve([]),
    enabled: !!clientId,
  })

  const { data: unresolvedCount = 0 } = useQuery({
    queryKey: ['data-conflicts-count', clientId],
    queryFn: () => (clientId ? fetchUnresolvedConflictCount(clientId) : 0),
    enabled: !!clientId,
  })

  const unresolved = conflicts.filter((c) => !c.resolved)

  const openModal = useCallback((warehouseId?: string | null) => {
    setWarehouseFilter(warehouseId)
    setModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setModalOpen(false)
  }, [])

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['data-conflicts', clientId] })
    await qc.invalidateQueries({ queryKey: ['data-conflicts-count', clientId] })
    await refetch()
  }, [clientId, qc, refetch])

  const resolve = useCallback(
    async (
      conflict: DataConflict,
      chosenSource: DataConflictSource,
      comment?: string,
    ) => {
      await resolveDataConflict(conflict, chosenSource, comment)
      await refresh()
    },
    [refresh],
  )

  useEffect(() => {
    if (!clientId) return
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ clientId?: string; warehouseId?: string | null }>)
        .detail
      if (detail?.clientId && detail.clientId !== clientId) return
      openModal(detail?.warehouseId)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [clientId, openModal])

  return {
    conflicts,
    unresolved,
    unresolvedCount,
    modalOpen,
    openModal,
    closeModal,
    refresh,
    resolve,
    warehouseFilter,
  }
}

export function dispatchOpenConflictsModal(
  clientId: string,
  warehouseId?: string | null,
) {
  window.dispatchEvent(
    new CustomEvent(OPEN_EVENT, { detail: { clientId, warehouseId } }),
  )
}

import { parseISO, subDays } from 'date-fns'

export type WarehouseReadingStats = {
  count30: number
  stale24h: boolean
}

export function getWarehouseReadingStats(warehouseId: string): WarehouseReadingStats {
  try {
    const raw = localStorage.getItem(`storage_readings_${warehouseId}`)
    const readings: { recorded_at: string }[] = raw ? JSON.parse(raw) : []
    const cutoff30 = subDays(new Date(), 30)
    const count30 = readings.filter((r) => parseISO(r.recorded_at) >= cutoff30).length
    let latestAt: string | null = null
    for (const r of readings) {
      if (!latestAt || r.recorded_at > latestAt) latestAt = r.recorded_at
    }
    const stale24h =
      latestAt != null && Date.now() - parseISO(latestAt).getTime() > 24 * 60 * 60 * 1000
    return { count30, stale24h }
  } catch {
    return { count30: 0, stale24h: false }
  }
}

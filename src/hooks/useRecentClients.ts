const KEY = 'ek_recent_clients'
const MAX = 10

export interface RecentClient {
  id: string
  name: string
  hasActiveChecklist?: boolean
}

export function getRecentClients(): RecentClient[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function addRecentClient(id: string, name: string, hasActiveChecklist?: boolean) {
  const list = getRecentClients().filter((c) => c.id !== id)
  list.unshift({ id, name, hasActiveChecklist })
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
}

export function getRecentClientIds(): string[] {
  return getRecentClients().map((c) => c.id)
}

import type {
  Checklist,
  ChecklistItem,
  Client,
  DataConflict,
  Document,
  License,
  LicenseAddress,
  RentalContract,
  SourcePriority,
  Warehouse,
} from '../types'

const KEYS = {
  clients: 'ek_clients',
  licenses: 'ek_licenses',
  licenseAddresses: 'ek_license_addresses',
  rentalContracts: 'ek_rental_contracts',
  warehouses: 'ek_warehouses',
  checklists: 'ek_checklists',
  items: 'ek_checklist_items',
  documents: 'ek_documents',
  dataConflicts: 'ek_data_conflicts',
  sourcePriorities: 'ek_source_priorities',
} as const

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

function write<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data))
}

export function uid(): string {
  return crypto.randomUUID()
}

export const localStore = {
  getClients: () => read<Client>(KEYS.clients),
  saveClient: (client: Client) => {
    const list = read<Client>(KEYS.clients)
    const idx = list.findIndex((c) => c.id === client.id)
    if (idx >= 0) list[idx] = client
    else list.push(client)
    write(KEYS.clients, list)
    return client
  },
  deleteClient: (id: string) => {
    write(KEYS.clients, read<Client>(KEYS.clients).filter((c) => c.id !== id))
  },

  getLicenses: () => read<License>(KEYS.licenses),
  saveLicense: (license: License) => {
    const list = read<License>(KEYS.licenses)
    const idx = list.findIndex((l) => l.id === license.id)
    if (idx >= 0) list[idx] = license
    else list.push(license)
    write(KEYS.licenses, list)
    return license
  },

  getLicenseAddresses: (licenseId: string) =>
    read<LicenseAddress>(KEYS.licenseAddresses).filter((a) => a.license_id === licenseId),

  replaceLicenseAddresses: (licenseId: string, addresses: LicenseAddress[]) => {
    const rest = read<LicenseAddress>(KEYS.licenseAddresses).filter(
      (a) => a.license_id !== licenseId,
    )
    write(KEYS.licenseAddresses, [...rest, ...addresses])
  },

  getRentalContracts: (clientId?: string) => {
    const all = read<RentalContract>(KEYS.rentalContracts)
    return clientId ? all.filter((c) => c.client_id === clientId) : all
  },
  saveRentalContract: (contract: RentalContract) => {
    const list = read<RentalContract>(KEYS.rentalContracts)
    const idx = list.findIndex((c) => c.id === contract.id)
    if (idx >= 0) list[idx] = contract
    else list.push(contract)
    write(KEYS.rentalContracts, list)
    return contract
  },

  getChecklists: () => read<Checklist>(KEYS.checklists),
  saveChecklist: (checklist: Checklist) => {
    const list = read<Checklist>(KEYS.checklists)
    const idx = list.findIndex((c) => c.id === checklist.id)
    if (idx >= 0) list[idx] = checklist
    else list.push(checklist)
    write(KEYS.checklists, list)
    return checklist
  },

  getItems: () => read<ChecklistItem>(KEYS.items),
  saveItems: (items: ChecklistItem[]) => {
    const all = read<ChecklistItem>(KEYS.items)
    const ids = new Set(items.map((i) => i.id))
    const merged = [...all.filter((i) => !ids.has(i.id)), ...items]
    write(KEYS.items, merged)
    return items
  },
  saveItem: (item: ChecklistItem) => {
    localStore.saveItems([item])
    return item
  },

  getWarehouses: (clientId?: string) => {
    const all = read<Warehouse>(KEYS.warehouses)
    return clientId ? all.filter((w) => w.client_id === clientId) : all
  },
  saveWarehouse: (warehouse: Warehouse) => {
    const list = read<Warehouse>(KEYS.warehouses)
    const idx = list.findIndex((w) => w.id === warehouse.id)
    if (idx >= 0) list[idx] = warehouse
    else list.push(warehouse)
    write(KEYS.warehouses, list)
    return warehouse
  },
  deleteWarehouse: (id: string) => {
    write(KEYS.warehouses, read<Warehouse>(KEYS.warehouses).filter((w) => w.id !== id))
  },

  getDocuments: () => read<Document>(KEYS.documents),
  saveDocument: (doc: Document) => {
    const list = read<Document>(KEYS.documents)
    const dupIdx = list.findIndex(
      (d) =>
        d.filename === doc.filename &&
        d.doc_type === doc.doc_type &&
        d.client_id === doc.client_id &&
        (d.warehouse_id ?? '') === (doc.warehouse_id ?? ''),
    )
    if (dupIdx >= 0) list[dupIdx] = doc
    else list.push(doc)
    write(KEYS.documents, list)
    return doc
  },
  deleteDocument: (id: string) => {
    write(KEYS.documents, read<Document>(KEYS.documents).filter((d) => d.id !== id))
  },

  getDataConflicts: (clientId?: string) => {
    const all = read<DataConflict>(KEYS.dataConflicts)
    return clientId ? all.filter((c) => c.client_id === clientId) : all
  },
  saveDataConflict: (conflict: DataConflict) => {
    const list = read<DataConflict>(KEYS.dataConflicts)
    const idx = list.findIndex((c) => c.id === conflict.id)
    if (idx >= 0) list[idx] = conflict
    else list.push(conflict)
    write(KEYS.dataConflicts, list)
    return conflict
  },

  getSourcePriorities: (clientId: string) =>
    read<SourcePriority>(KEYS.sourcePriorities).filter((p) => p.client_id === clientId),

  saveSourcePriority: (row: SourcePriority) => {
    const list = read<SourcePriority>(KEYS.sourcePriorities)
    const idx = list.findIndex(
      (p) => p.client_id === row.client_id && p.field === row.field,
    )
    if (idx >= 0) list[idx] = row
    else list.push(row)
    write(KEYS.sourcePriorities, list)
    return row
  },
}

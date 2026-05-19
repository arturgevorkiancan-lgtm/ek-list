import { localStore, uid } from './localStore'
import type { Client, License } from '../types'

export function seedDemoDataIfEmpty() {
  if (localStore.getClients().length > 0) return

  const clientId = uid()
  const client: Client = {
    id: clientId,
    name: 'ООО «Виноторг»',
    inn: '7701234567',
    kpp: '770101001',
    ogrn: '1027700132195',
    legal_address: 'г. Москва, ул. Примерная, д. 1',
    contact_person: 'Иванов И.И.',
    phone: '+7 (495) 123-45-67',
    email: 'info@vintorg.example',
    created_at: new Date().toISOString(),
  }

  const license: License = {
    id: uid(),
    client_id: clientId,
    license_number: '77Л000012345',
    issue_date: '2023-06-01',
    expiry_date: '2026-08-15',
    license_type: 'Хранение и оптовая продажа',
    license_activity: 'Хранение и оптовая продажа',
    license_status: 'действующая',
    licensee_name: client.name,
    licensee_kpp: client.kpp,
    legal_address: client.legal_address,
    email: client.email,
    addresses: [{ address: 'г. Москва, ул. Складская, д. 5', kpp: '770145001' }],
    created_at: new Date().toISOString(),
  }

  localStore.saveClient(client)
  localStore.saveLicense(license)
}

export type OperationType =
  | 'ПОЛУЧЕНИЕ'
  | 'ПЕРЕОФОРМЛЕНИЕ'
  | 'ПРОДЛЕНИЕ'
  | 'ПРОВЕРКА_ВЫЕЗДНАЯ'
  | 'ПРОВЕРКА_ВНЕПЛАНОВАЯ'

export type ChecklistStatus = 'draft' | 'active' | 'completed' | 'archived'

export type ItemStatus = 'not_started' | 'in_progress' | 'done' | 'na'

export type ProductTypeFlag = 'customs_warehouse' | 'has_stock' | 'retail' | 'wholesale'

export interface Client {
  id: string
  name: string
  inn: string | null
  kpp: string | null
  ogrn: string | null
  legal_address: string | null
  short_name?: string | null
  director_last_name?: string | null
  director_first_name?: string | null
  director_middle_name?: string | null
  director_phone?: string | null
  representative_name?: string | null
  representative_poa?: string | null
  alcohol_over_15_pct?: boolean | null
  contact_person: string | null
  phone: string | null
  email: string | null
  egrn_data?: ParsedEGRN | null
  created_at: string
}

export type ClientDocType =
  | 'egryl'
  | 'license'
  | 'egrn'
  | 'rental'
  | 'tech_plan'
  | 'op_notification'
  | 'application_verification'

export interface Warehouse {
  id: string
  client_id: string
  name: string
  kpp: string | null
  address: string | null
  cadastral_number: string | null
  area_sqm: number | null
  floor: string | null
  room_number: string | null
  object_purpose: string | null
  additional_address_info: string | null
  created_at: string
}

export interface ParsedOPNotification {
  format: 'form_1_3' | 'egrn_extract'
  organizationName: string
  ogrn?: string
  inn: string
  kppMain: string
  kppOP: string
  opAddress: string
  registrationDate?: string
  rawText?: string
}

export interface License {
  id: string
  client_id: string
  license_number: string | null
  issue_date: string | null
  expiry_date: string | null
  license_type: string | null
  license_activity: string | null
  license_status: string | null
  licensee_name: string | null
  licensee_kpp: string | null
  legal_address: string | null
  email: string | null
  renewal_years?: number | null
  payment_order_number?: string | null
  payment_order_date?: string | null
  reissue_reason?: string | null
  reissue_description?: string | null
  addresses: LicenseAddressJson[]
  created_at: string
}

export interface LicenseAddressJson {
  address: string
  kpp?: string
  notes?: string
  cadastral_number?: string
  area_sqm?: number | string | null
  floor?: string
  room_number?: string
  object_purpose?: string
  additional_address_info?: string
}

export interface LicenseAddress {
  id: string
  license_id: string
  address: string
  kpp: string | null
  notes: string | null
  cadastral_number?: string | null
  area_sqm?: number | null
  floor?: string | null
  room_number?: string | null
  object_purpose?: string | null
  additional_address_info?: string | null
}

export interface RentalContract {
  id: string
  client_id: string
  warehouse_id?: string | null
  contract_number: string | null
  contract_date: string | null
  landlord_name: string | null
  rent_start: string | null
  rent_end: string | null
  address: string | null
  area_sqm: number | null
  license_address_id: string | null
  parsed_data: Record<string, unknown> | null
  created_at: string
}

export interface Checklist {
  id: string
  client_id: string
  license_id: string | null
  operation_type: OperationType
  product_types: ProductTypeFlag[]
  status: ChecklistStatus
  created_at: string
  updated_at: string
}

export interface ChecklistItem {
  id: string
  checklist_id: string
  block_num: number
  item_num: number
  title: string
  notes: string | null
  status: ItemStatus
  due_date: string | null
  completed_at: string | null
  comment: string | null
}

export interface Document {
  id: string
  client_id: string | null
  warehouse_id?: string | null
  checklist_id: string | null
  item_id: string | null
  filename: string
  storage_path: string | null
  doc_type: string | null
  parsed_data: Record<string, unknown> | null
  uploaded_at: string
}

export interface ChecklistTemplateItem {
  block: number
  id: number
  title: string
  note?: string
  types?: OperationType[]
  conditional?: 'customs_warehouse' | 'has_stock'
}

export type LicenseExpiryStatus = 'expired' | 'warning_6m' | 'warning_95d' | 'ok' | 'none'

export interface ClientWithMeta extends Client {
  activeChecklist?: Checklist | null
  latestLicense?: License | null
  expiryStatus: LicenseExpiryStatus
}

export interface ParsedEGRN {
  address: string
  cadastralNumber: string
  ownerName: string
  area?: string
  rightType?: string
  registrationDate?: string
  rawText?: string
}

export interface ParsedEGRYLData {
  client: {
    fullName: string
    shortName: string
    ogrn: string
    inn: string
    kpp: string
    legalAddress: string
    registrationDate?: string
  }
  /** Адреса обособленных подразделений (не юридический адрес организации). */
  branches?: Array<{ address: string; kpp?: string }>
  license?: {
    licenseNumber: string
    issueDate: string
    expiryDate: string
    licenseActivity: string
    licenseAuthority: string
  }
  rawText: string
}

export interface ParsedLicenseData {
  licenseNumber: string
  inn: string
  kpp: string
  fullName?: string
  legalAddress?: string
  email?: string
  issueDate: string
  expiryDate: string
  licenseActivity: string
  licenseStatus: string
  branches: Array<{
    kpp: string
    address: string
    cadastral_number?: string
    area_sqm?: number | string | null
    floor?: string
    room_number?: string
    object_purpose?: string
    additional_address_info?: string
  }>
  format: 'registry_table' | 'ratk_extract'
  rawText: string
}

/** @deprecated use ParsedLicenseData */
export type ParsedLicense = ParsedLicenseData & {
  organizationName?: string
  addresses?: { address: string; kpp?: string }[]
}

export interface NotificationBanner {
  id: string
  type: 'critical' | 'application' | 'renewal'
  message: string
  clientId: string
  clientName: string
}

export interface ParsedRentalData {
  contractNumber?: string
  contractDate?: string
  landlordName?: string
  tenantName?: string
  address?: string
  areaSqm?: number
  rentStart?: string
  rentEnd?: string
  isProbablyScan: boolean
  rawText: string
}

export interface ParsedTechPlanData {
  cadastralNumber?: string
  area?: number
  address?: string
  purpose?: string
  floor?: string
  roomNumber?: string
  format: 'xml' | 'pdf'
  isProbablyScan?: boolean
}

export type ApplicationType = 'renewal' | 'new' | 'reissue'

export interface ParsedApplicationData {
  applicationType: ApplicationType
  applicationNumber: string
  applicationDate: string
  client: {
    fullName: string
    shortName: string
    ogrn: string
    inn: string
    kpp: string
    legalAddress: string
    directorLastName: string
    directorFirstName: string
    directorMiddleName: string
    phone: string
    email: string
  }
  license: {
    licenseNumber: string
    licenseIssueDate: string
    licenseActivity: string
    alcoholOver15: boolean
    renewalYears?: number
    paymentOrderNumber?: string
    paymentOrderDate?: string
    reissueReason?: string
  }
  branches: Array<{
    kpp: string
    address: string
    cadastralNumber?: string
    area?: string
    additionalInfo?: string
  }>
  rawText: string
}

export type VerificationStatus = 'ok' | 'warning' | 'error' | 'missing'

export interface VerificationResult {
  field: string
  fieldKey: string
  ourValue: string
  applicationValue: string
  status: VerificationStatus
}

export interface ApplicationVerificationSave {
  results: VerificationResult[]
  summary: {
    total: number
    ok: number
    warnings: number
    errors: number
    missing: number
  }
  applicationType: ApplicationType
  parsedApplication: ParsedApplicationData
}

export type DataConflictLevel = 'critical' | 'important' | 'info'

export type DataConflictSource = 'egryl' | 'license' | 'egrn' | 'techplan'

export interface DataConflict {
  id: string
  client_id: string | null
  warehouse_id: string | null
  field: string
  source_a: DataConflictSource
  value_a: string | null
  source_b: DataConflictSource
  value_b: string | null
  priority_source: DataConflictSource | null
  level: DataConflictLevel
  resolved: boolean
  resolved_at: string | null
  resolution_comment: string | null
  created_at: string
}

export interface SourcePriority {
  id: string
  client_id: string
  field: string
  priority_order: DataConflictSource[]
  created_at: string
}

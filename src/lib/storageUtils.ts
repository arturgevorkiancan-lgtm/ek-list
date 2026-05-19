import { GOST_DATA, type ProductType } from '../components/StorageStandardsCard'

export interface SafeRange {
  tempMin: number
  tempMax: number
  humidityMin: number
  humidityMax: number
  compatible: boolean
}

export function computeSafeRange(productTypes: ProductType[]): SafeRange | null {
  if (!productTypes.length) return null
  const tempMin = Math.max(...productTypes.map((p) => GOST_DATA[p].tempMin))
  const tempMax = Math.min(...productTypes.map((p) => GOST_DATA[p].tempMax))
  const humidityMin = Math.max(...productTypes.map((p) => GOST_DATA[p].humidityMin))
  const humidityMax = Math.min(...productTypes.map((p) => GOST_DATA[p].humidityMax))
  return {
    tempMin,
    tempMax,
    humidityMin,
    humidityMax,
    compatible: tempMin <= tempMax && humidityMin <= humidityMax,
  }
}

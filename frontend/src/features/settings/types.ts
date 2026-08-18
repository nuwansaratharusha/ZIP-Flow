export type ReceiptSettings = {
  businessName: string
  footerMessage: string
  showTaxId: boolean
  taxId: string | null
  showCollectionCode: boolean
}

export type Currency = {
  id: string | null
  code: string
  symbol: string
  rate: number
  isBase: boolean
}

export type CurrencySettings = {
  baseCode: string
  baseSymbol: string
  supported: Currency[]
}

export type TaxSettings = {
  vatRatePercent: number
  serviceChargeRatePercent: number
}

export type ReceiptSettings = {
  businessName: string
  footerMessage: string
  showTaxId: boolean
  taxId: string | null
}

export type TaxSettings = {
  vatRatePercent: number
  serviceChargeRatePercent: number
}

export type PrinterSettings = {
  ipAddress: string | null
  port: number
}

import { apiRequest, type ApiEnvelope } from '../../lib/api'
import type { ReceiptSettings, TaxSettings } from './types'

export function getReceiptSettings() {
  return apiRequest<ApiEnvelope<ReceiptSettings>>('/api/settings/receipt').then((res) => res.data)
}

export function updateReceiptSettings(input: {
  businessName: string | null
  footerMessage: string
  showTaxId: boolean
  taxId: string | null
}) {
  return apiRequest<ApiEnvelope<ReceiptSettings>>('/api/settings/receipt', {
    method: 'PUT',
    body: JSON.stringify(input),
  }).then((res) => res.data)
}

export function getTaxSettings() {
  return apiRequest<ApiEnvelope<TaxSettings>>('/api/settings/tax').then((res) => res.data)
}

export function updateTaxSettings(vatRatePercent: number, serviceChargeRatePercent: number) {
  return apiRequest<ApiEnvelope<TaxSettings>>('/api/settings/tax', {
    method: 'PUT',
    body: JSON.stringify({ vatRatePercent, serviceChargeRatePercent }),
  }).then((res) => res.data)
}

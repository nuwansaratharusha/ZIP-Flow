import { apiRequest, type ApiEnvelope } from '../../lib/api'
import type { CurrencySettings, ReceiptSettings, TaxSettings } from './types'

export function getReceiptSettings() {
  return apiRequest<ApiEnvelope<ReceiptSettings>>('/api/settings/receipt').then((res) => res.data)
}

export function updateReceiptSettings(input: {
  businessName: string | null
  footerMessage: string
  showTaxId: boolean
  taxId: string | null
  showCollectionCode: boolean
}) {
  return apiRequest<ApiEnvelope<ReceiptSettings>>('/api/settings/receipt', {
    method: 'PUT',
    body: JSON.stringify(input),
  }).then((res) => res.data)
}

export function getCurrencies() {
  return apiRequest<ApiEnvelope<CurrencySettings>>('/api/settings/currencies').then((res) => res.data)
}

export function addCurrency(code: string, symbol: string, rate: number) {
  return apiRequest<ApiEnvelope<CurrencySettings>>('/api/settings/currencies', {
    method: 'POST',
    body: JSON.stringify({ code, symbol, rate }),
  }).then((res) => res.data)
}

export function updateCurrency(id: string, symbol: string, rate: number) {
  return apiRequest<ApiEnvelope<CurrencySettings>>(`/api/settings/currencies/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ symbol, rate }),
  }).then((res) => res.data)
}

export function removeCurrency(id: string) {
  return apiRequest<ApiEnvelope<CurrencySettings>>(`/api/settings/currencies/${id}`, {
    method: 'DELETE',
  }).then((res) => res.data)
}

export function updateBaseCurrency(code: string, symbol: string) {
  return apiRequest<ApiEnvelope<CurrencySettings>>('/api/settings/currency/base', {
    method: 'PUT',
    body: JSON.stringify({ code, symbol }),
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

import { apiRequest, type ApiEnvelope } from '../../lib/api'
import type { StockAdjustment, StockItem } from './types'

export function getItems() {
  return apiRequest<ApiEnvelope<StockItem[]>>('/api/inventory/items').then((res) => res.data)
}

export function createItem(input: { name: string; sku: string; unit: string; parLevel: number; reorderLevel: number; cost: number; initialQuantity: number }) {
  return apiRequest<ApiEnvelope<StockItem>>('/api/inventory/items', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((res) => res.data)
}

export function updateItem(id: string, input: { name: string; sku: string; unit: string; parLevel: number; reorderLevel: number; cost: number }) {
  return apiRequest<ApiEnvelope<StockItem>>(`/api/inventory/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }).then((res) => res.data)
}

export function archiveItem(id: string) {
  return apiRequest<ApiEnvelope<{ archived: boolean }>>(`/api/inventory/items/${id}/archive`, {
    method: 'POST',
  }).then((res) => res.data)
}

export function adjustStock(id: string, delta: number, reason: string) {
  return apiRequest<ApiEnvelope<StockItem>>(`/api/inventory/items/${id}/adjust`, {
    method: 'POST',
    body: JSON.stringify({ delta, reason }),
  }).then((res) => res.data)
}

export function getAdjustments(id: string) {
  return apiRequest<ApiEnvelope<StockAdjustment[]>>(`/api/inventory/items/${id}/adjustments`).then((res) => res.data)
}

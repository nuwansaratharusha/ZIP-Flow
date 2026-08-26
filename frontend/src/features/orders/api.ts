import { apiRequest, type ApiEnvelope } from '../../lib/api'
import type { Order, OrderLineRequest } from './types'

export function openOrder(tableId: string, customerName: string, customerPhone?: string, id?: string) {
  return apiRequest<ApiEnvelope<Order>>('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ id, tableId, customerName, customerPhone }),
  }).then((res) => res.data)
}

export function sendRound(orderId: string, lines: OrderLineRequest[], id?: string) {
  return apiRequest<ApiEnvelope<Order>>(`/api/orders/${orderId}/rounds`, {
    method: 'POST',
    body: JSON.stringify({ id, lines }),
  }).then((res) => res.data)
}

export function closeOrder(orderId: string) {
  return apiRequest<ApiEnvelope<Order>>(`/api/orders/${orderId}/close`, {
    method: 'POST',
  }).then((res) => res.data)
}

export function cancelOrder(orderId: string) {
  return apiRequest<ApiEnvelope<Order>>(`/api/orders/${orderId}/cancel`, {
    method: 'POST',
  }).then((res) => res.data)
}

export function getOrders(filters?: { search?: string; status?: string }) {
  const params = new URLSearchParams()
  if (filters?.search) params.set('search', filters.search)
  if (filters?.status && filters.status !== 'All') params.set('status', filters.status)
  const query = params.toString()
  return apiRequest<ApiEnvelope<Order[]>>(`/api/orders${query ? `?${query}` : ''}`).then((res) => res.data)
}

export function getOrder(id: string) {
  return apiRequest<ApiEnvelope<Order>>(`/api/orders/${id}`).then((res) => res.data)
}

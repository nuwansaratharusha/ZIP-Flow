import { apiRequest, type ApiEnvelope } from '../../lib/api'
import type { Order, OrderLineRequest, OrderStatus } from './types'

export function sendToKitchen(serviceMode: string, lines: OrderLineRequest[], currencyCode?: string, id?: string) {
  return apiRequest<ApiEnvelope<Order>>('/api/orders/send-to-kitchen', {
    method: 'POST',
    body: JSON.stringify({ serviceMode, currencyCode, lines, id }),
  }).then((res) => res.data)
}

export function completeOrder(orderId: string, paymentMethod: string, amountTendered?: number) {
  return apiRequest<ApiEnvelope<Order>>(`/api/orders/${orderId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ paymentMethod, amountTendered }),
  }).then((res) => res.data)
}

export function createCompletedOrder(
  serviceMode: string,
  paymentMethod: string,
  lines: OrderLineRequest[],
  currencyCode?: string,
  amountTendered?: number
) {
  return apiRequest<ApiEnvelope<Order>>('/api/orders/complete-payment', {
    method: 'POST',
    body: JSON.stringify({ serviceMode, paymentMethod, currencyCode, amountTendered, lines }),
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

export function setOrderStatus(id: string, status: OrderStatus) {
  return apiRequest<ApiEnvelope<Order>>(`/api/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }).then((res) => res.data)
}

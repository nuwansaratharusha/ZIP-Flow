import { apiRequest, type ApiEnvelope } from '../../lib/api'
import type { Order, OrderLineRequest, OrderStatus } from './types'

export function createOrder(
  serviceMode: string,
  paymentMethod: string,
  lines: OrderLineRequest[],
  options?: { destinationLabel?: string; currencyCode?: string; amountTendered?: number; id?: string }
) {
  return apiRequest<ApiEnvelope<Order>>('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      serviceMode,
      destinationLabel: options?.destinationLabel,
      paymentMethod,
      currencyCode: options?.currencyCode,
      amountTendered: options?.amountTendered,
      lines,
      id: options?.id,
    }),
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

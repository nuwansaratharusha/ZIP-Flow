import { apiRequest, type ApiEnvelope } from '../../lib/api'
import type { RestaurantTable } from './types'

export function getTables() {
  return apiRequest<ApiEnvelope<RestaurantTable[]>>('/api/tables').then((res) => res.data)
}

export function createTable(name: string, section: string, capacity: number, floorId: string) {
  return apiRequest<ApiEnvelope<RestaurantTable>>('/api/tables', {
    method: 'POST',
    body: JSON.stringify({ name, section, capacity, floorId }),
  }).then((res) => res.data)
}

export function updateTable(id: string, name: string, section: string, capacity: number, floorId: string) {
  return apiRequest<ApiEnvelope<RestaurantTable>>(`/api/tables/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, section, capacity, floorId }),
  }).then((res) => res.data)
}

export function archiveTable(id: string) {
  return apiRequest<ApiEnvelope<{ archived: boolean }>>(`/api/tables/${id}/archive`, {
    method: 'POST',
  }).then((res) => res.data)
}

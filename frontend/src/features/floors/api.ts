import { apiRequest, type ApiEnvelope } from '../../lib/api'
import type { Floor } from './types'

export function getFloors() {
  return apiRequest<ApiEnvelope<Floor[]>>('/api/floors').then((res) => res.data)
}

export function createFloor(name: string) {
  return apiRequest<ApiEnvelope<Floor>>('/api/floors', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }).then((res) => res.data)
}

export function updateFloor(id: string, name: string) {
  return apiRequest<ApiEnvelope<Floor>>(`/api/floors/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  }).then((res) => res.data)
}

export function archiveFloor(id: string) {
  return apiRequest<ApiEnvelope<{ archived: boolean }>>(`/api/floors/${id}/archive`, {
    method: 'POST',
  }).then((res) => res.data)
}

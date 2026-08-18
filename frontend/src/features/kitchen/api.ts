import { apiRequest, type ApiEnvelope } from '../../lib/api'
import type { Ticket } from './types'

export function getTickets() {
  return apiRequest<ApiEnvelope<Ticket[]>>('/api/kitchen/tickets').then((res) => res.data)
}

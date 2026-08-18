export type TicketLine = {
  name: string
  quantity: number
  notes: string | null
  station: string | null
}

export type Ticket = {
  id: string
  orderNumber: number
  serviceMode: string
  status: 'Sent' | 'Preparing' | 'Ready'
  createdAt: string
  lines: TicketLine[]
}

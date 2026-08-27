export type OrderLine = {
  name: string
  quantity: number
  price: number
  lineTotal: number
  notes: string | null
}

export type OrderRound = {
  id: string
  roundNumber: number
  sentAt: string
  roundTotal: number
  lines: OrderLine[]
}

export const ORDER_STATUSES = ['Open', 'Closed', 'Cancelled'] as const

export type OrderStatus = typeof ORDER_STATUSES[number]

export type Order = {
  id: string
  orderNumber: number
  tableId: string
  tableName: string
  customerName: string
  customerPhone: string | null
  guestCount: number | null
  status: OrderStatus
  subtotal: number
  serviceCharge: number
  tax: number
  total: number
  currencyCode: string
  currencySymbol: string
  createdAt: string
  closedAt: string | null
  rounds: OrderRound[]
}

export type OrderLineRequest = {
  menuItemId: string
  quantity: number
  notes?: string
}

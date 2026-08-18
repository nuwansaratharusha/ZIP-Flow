export type OrderLine = {
  name: string
  quantity: number
  price: number
  lineTotal: number
}

export const ORDER_STATUSES = ['Open', 'Sent', 'Preparing', 'Ready', 'Completed', 'Cancelled'] as const

export type OrderStatus = typeof ORDER_STATUSES[number]

export type Order = {
  id: string
  orderNumber: number
  serviceMode: string
  status: OrderStatus
  paymentMethod: string | null
  subtotal: number
  tax: number
  total: number
  createdAt: string
  lines: OrderLine[]
}

export type OrderLineRequest = {
  menuItemId: string
  quantity: number
}

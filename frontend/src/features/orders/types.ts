export type OrderLine = {
  name: string
  quantity: number
  price: number
  lineTotal: number
  notes: string | null
}

export const ORDER_STATUSES = ['Open', 'Sent', 'Preparing', 'Ready', 'Completed', 'Cancelled'] as const

export type OrderStatus = typeof ORDER_STATUSES[number]

export const PAYMENT_STATES = ['Unpaid', 'Paid', 'Refunded'] as const

export type PaymentState = typeof PAYMENT_STATES[number]

export type Order = {
  id: string
  orderNumber: number
  serviceMode: string
  status: OrderStatus
  paymentState: PaymentState
  destinationLabel: string | null
  paymentMethod: string | null
  subtotal: number
  serviceCharge: number
  tax: number
  total: number
  currencyCode: string
  currencySymbol: string
  amountTendered: number
  changeDue: number
  createdAt: string
  lines: OrderLine[]
}

export type OrderLineRequest = {
  menuItemId: string
  quantity: number
  notes?: string
}

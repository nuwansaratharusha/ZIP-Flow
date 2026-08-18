export type StockItem = {
  id: string
  name: string
  sku: string
  unit: string
  quantity: number
  parLevel: number
  reorderLevel: number
  cost: number
  isArchived: boolean
}

export type StockAdjustment = {
  id: string
  delta: number
  quantityBefore: number
  quantityAfter: number
  reason: string
  createdAt: string
}

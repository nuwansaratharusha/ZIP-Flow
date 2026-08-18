export const TABLE_SECTIONS = ['Main Dining', 'Patio', 'Bar & Lounge', 'Private Booths'] as const

export type TableStatus = 'available' | 'occupied' | 'reserved'

export type RestaurantTable = {
  id: string
  name: string
  section: string
  capacity: number
  status: TableStatus
  isArchived: boolean
}

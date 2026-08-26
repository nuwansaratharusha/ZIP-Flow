export type Category = {
  id: string
  name: string
  sortOrder: number
}

export type MenuItem = {
  id: string
  categoryId: string
  name: string
  sku: string
  price: number
  isAvailable: boolean
  isArchived: boolean
}

export type Catalog = {
  categories: Category[]
  items: MenuItem[]
}

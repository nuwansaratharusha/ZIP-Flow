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

// One row of an OCR menu-photo import draft (before the user confirms).
export type OcrDraftItem = {
  name: string
  price: number
  category: string
  sku: string
  categoryExists: boolean
  duplicate: boolean
}

export const STATIONS = ['Grill', 'Bar', 'Pizza', 'Dessert', 'Expo'] as const

export type Category = {
  id: string
  name: string
  sortOrder: number
  station: string | null
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

export type RecipeIngredientLine = {
  stockItemId: string
  stockItemName: string
  quantity: number
  unit: string
  lineCost: number
}

export type Recipe = {
  menuItemId: string
  yield: number
  lines: RecipeIngredientLine[]
  totalCost: number
  costPerServing: number
  foodCostPercentage: number | null
}

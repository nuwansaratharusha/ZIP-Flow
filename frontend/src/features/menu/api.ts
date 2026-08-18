import { apiRequest, type ApiEnvelope } from '../../lib/api'
import type { Catalog, Category, MenuItem, Recipe, RecipeIngredientLine } from './types'

export function getCategories() {
  return apiRequest<ApiEnvelope<Category[]>>('/api/menu/categories').then((res) => res.data)
}

export function createCategory(name: string, sortOrder: number, station?: string) {
  return apiRequest<ApiEnvelope<Category>>('/api/menu/categories', {
    method: 'POST',
    body: JSON.stringify({ name, sortOrder, station: station || null }),
  }).then((res) => res.data)
}

export function getItems() {
  return apiRequest<ApiEnvelope<MenuItem[]>>('/api/menu/items').then((res) => res.data)
}

export function createItem(categoryId: string, name: string, sku: string, price: number) {
  return apiRequest<ApiEnvelope<MenuItem>>('/api/menu/items', {
    method: 'POST',
    body: JSON.stringify({ categoryId, name, sku, price }),
  }).then((res) => res.data)
}

export function updateItem(id: string, name: string, price: number, categoryId: string) {
  return apiRequest<ApiEnvelope<MenuItem>>(`/api/menu/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, price, categoryId }),
  }).then((res) => res.data)
}

export function setAvailability(id: string, isAvailable: boolean) {
  return apiRequest<ApiEnvelope<MenuItem>>(`/api/menu/items/${id}/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ isAvailable }),
  }).then((res) => res.data)
}

export function archiveItem(id: string) {
  return apiRequest<ApiEnvelope<{ archived: boolean }>>(`/api/menu/items/${id}/archive`, {
    method: 'POST',
  }).then((res) => res.data)
}

export function getCatalog() {
  return apiRequest<ApiEnvelope<Catalog>>('/api/menu/catalog').then((res) => res.data)
}

export function getRecipe(menuItemId: string) {
  return apiRequest<ApiEnvelope<Recipe | null>>(`/api/menu/items/${menuItemId}/recipe`).then((res) => res.data)
}

export function saveRecipe(menuItemId: string, yieldCount: number, lines: Pick<RecipeIngredientLine, 'stockItemId' | 'quantity' | 'unit'>[]) {
  return apiRequest<ApiEnvelope<Recipe>>(`/api/menu/items/${menuItemId}/recipe`, {
    method: 'PUT',
    body: JSON.stringify({ yield: yieldCount, lines }),
  }).then((res) => res.data)
}

import { apiRequest, apiUpload, type ApiEnvelope } from '../../lib/api'
import type { Catalog, Category, MenuItem, OcrDraftItem } from './types'

export function ocrPreview(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return apiUpload<ApiEnvelope<{ items: OcrDraftItem[] }>>('/api/menu/ocr/preview', fd).then((res) => res.data)
}

export function ocrCommit(items: { name: string; price: number; category: string; sku: string }[]) {
  return apiRequest<ApiEnvelope<{ created: number; skipped: number }>>('/api/menu/ocr/commit', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }).then((res) => res.data)
}

export function getCategories() {
  return apiRequest<ApiEnvelope<Category[]>>('/api/menu/categories').then((res) => res.data)
}

export function createCategory(name: string, sortOrder: number) {
  return apiRequest<ApiEnvelope<Category>>('/api/menu/categories', {
    method: 'POST',
    body: JSON.stringify({ name, sortOrder }),
  }).then((res) => res.data)
}

export function deleteCategory(id: string) {
  return apiRequest<ApiEnvelope<{ deleted: boolean }>>(`/api/menu/categories/${id}`, {
    method: 'DELETE',
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


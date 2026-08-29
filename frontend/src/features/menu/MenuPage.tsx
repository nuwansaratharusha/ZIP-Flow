import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Toast'
import { formatMoney } from '../../lib/currency'
import { useAuth } from '../auth/AuthContext'
import {
  archiveItem,
  createCategory,
  createItem,
  deleteCategory,
  getCategories,
  getItems,
  setAvailability,
  updateItem,
} from './api'
import type { Category, MenuItem } from './types'

export function MenuPage() {
  const { session } = useAuth()
  const toast = useToast()
  const currencySymbol = session?.tenant.currencySymbol ?? '£'

  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [selectedCatFilter, setSelectedCatFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [categoryName, setCategoryName] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)

  const [itemCategoryId, setItemCategoryId] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemSku, setItemSku] = useState('')
  const [itemPrice, setItemPrice] = useState('')
  const [itemError, setItemError] = useState('')
  const [savingItem, setSavingItem] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingPrice, setEditingPrice] = useState('')

  const categoryName_ById = useMemo(() => {
    const map = new Map<string, string>()
    categories.forEach((c) => map.set(c.id, c.name))
    return map
  }, [categories])

  const refetch = async () => {
    const [nextCategories, nextItems] = await Promise.all([getCategories(), getItems()])
    setCategories(nextCategories)
    setItems(nextItems)
  }

  useEffect(() => {
    refetch()
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load the menu.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!itemCategoryId && categories.length > 0) setItemCategoryId(categories[0].id)
  }, [categories, itemCategoryId])

  const activeItems = useMemo(() => items.filter((i) => !i.isArchived), [items])

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return activeItems.filter((item) => {
      if (selectedCatFilter !== 'all' && item.categoryId !== selectedCatFilter) return false
      if (query && !item.name.toLowerCase().includes(query) && !item.sku.toLowerCase().includes(query)) {
        return false
      }
      return true
    })
  }, [activeItems, selectedCatFilter, searchQuery])

  const submitCategory = async (event: FormEvent) => {
    event.preventDefault()
    setCategoryError('')
    if (!categoryName.trim()) return setCategoryError('Category name is required.')

    setSavingCategory(true)
    try {
      await createCategory(categoryName.trim(), categories.length)
      const name = categoryName.trim()
      setCategoryName('')
      await refetch()
      toast.success(`Category "${name}" created.`)
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'Failed to add category.')
    } finally {
      setSavingCategory(false)
    }
  }

  const handleDeleteCategory = async (category: Category) => {
    const count = activeItems.filter((i) => i.categoryId === category.id).length
    if (count > 0) {
      toast.warning(
        `Cannot delete "${category.name}" because it contains ${count} active dish(es). Reassign or archive them first.`,
      )
      return
    }

    if (!window.confirm(`Delete category "${category.name}"?`)) return

    try {
      await deleteCategory(category.id)
      if (selectedCatFilter === category.id) {
        setSelectedCatFilter('all')
      }
      if (itemCategoryId === category.id) {
        const remaining = categories.filter((c) => c.id !== category.id)
        setItemCategoryId(remaining[0]?.id ?? '')
      }
      await refetch()
      toast.success(`Category "${category.name}" deleted.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete category.')
    }
  }

  // Auto-generate SKU helper from name
  const handleNameChange = (nameVal: string) => {
    setItemName(nameVal)
    if (!itemSku || itemSku.startsWith('SKU-') || itemSku.length < 3) {
      const generated = nameVal
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6)
      if (generated) {
        setItemSku(generated)
      }
    }
  }

  const submitItem = async (event: FormEvent) => {
    event.preventDefault()
    setItemError('')

    const price = Number(itemPrice)
    if (!itemCategoryId) return setItemError('Choose a category first.')
    if (!itemName.trim() || !itemSku.trim()) return setItemError('Name and SKU are required.')
    if (!Number.isFinite(price) || price < 0) return setItemError('Enter a valid price.')

    setSavingItem(true)
    try {
      await createItem(itemCategoryId, itemName.trim(), itemSku.trim(), price)
      const createdName = itemName.trim()
      setItemName('')
      setItemSku('')
      setItemPrice('')
      await refetch()
      toast.success(`Dish "${createdName}" added to catalog.`)
    } catch (err) {
      setItemError(err instanceof Error ? err.message : 'Failed to add item.')
    } finally {
      setSavingItem(false)
    }
  }

  const startEditPrice = (item: MenuItem) => {
    setEditingId(item.id)
    setEditingPrice(String(item.price))
  }

  const savePrice = async (item: MenuItem) => {
    const price = Number(editingPrice)
    if (!Number.isFinite(price) || price < 0) {
      setEditingId(null)
      return
    }
    setEditingId(null)
    if (price === item.price) return

    try {
      await updateItem(item.id, item.name, price, item.categoryId)
      await refetch()
      toast.success(`Price for "${item.name}" updated to ${formatMoney(price, currencySymbol)}.`)
    } catch {
      toast.error('Failed to update price.')
    }
  }

  const toggleAvailability = async (item: MenuItem) => {
    const newStatus = !item.isAvailable
    try {
      await setAvailability(item.id, newStatus)
      await refetch()
      toast.info(newStatus ? `"${item.name}" is now In Stock.` : `"${item.name}" is now marked 86'd (Unavailable).`)
    } catch {
      toast.error('Failed to toggle availability.')
    }
  }

  const archive = async (item: MenuItem) => {
    if (!window.confirm(`Archive menu item "${item.name}"?`)) return
    try {
      await archiveItem(item.id)
      await refetch()
      toast.info(`Item "${item.name}" archived.`)
    } catch {
      toast.error('Failed to archive item.')
    }
  }

  if (loading) {
    return (
      <main className="content menu-content">
        <div className="loading-container">
          <div className="btn-spinner large" />
          <p className="muted">Loading menu catalog…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="content menu-content">
      {/* Hero Header */}
      <div className="dashboard-hero menu-hero">
        <div>
          <p className="eyebrow">Product Catalog</p>
          <h1>Menu &amp; Dishes</h1>
          <p className="muted">
            Configure categories, prices, and 86 availability. Changes appear instantly on POS terminals.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="alert error">
          <Icon name="alertTriangle" size={16} /> {loadError}
        </div>
      )}

      {/* Main Grid: Catalog Left, Categories Right */}
      <section className="dashboard-grid menu-grid">
        {/* Left Column: Items List */}
        <div className="section-card menu-items-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Items</p>
              <h2>Dishes &amp; Drinks ({activeItems.length})</h2>
            </div>
          </div>

          {/* Search & Category Filter Toolbar */}
          <div className="menu-toolbar-row">
            <div className="menu-cat-pills">
              <button
                type="button"
                className={`filter-pill ${selectedCatFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCatFilter('all')}
              >
                All <span className="pill-count">{activeItems.length}</span>
              </button>
              {categories.map((c) => {
                const count = activeItems.filter((i) => i.categoryId === c.id).length
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`filter-pill ${selectedCatFilter === c.id ? 'active' : ''}`}
                    onClick={() => setSelectedCatFilter(c.id)}
                  >
                    {c.name} <span className="pill-count">{count}</span>
                  </button>
                )
              })}
            </div>

            <div className="menu-search-box">
              <Icon name="search" size={15} />
              <input
                placeholder="Search dish or SKU…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button type="button" className="search-clear-btn" onClick={() => setSearchQuery('')} title="Clear search">
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          </div>

          {filteredItems.length === 0 && (
            <div className="menu-empty-state">
              <div className="empty-icon-circle">
                <Icon name="utensils" size={32} />
              </div>
              <h3>No menu items found</h3>
              <p className="muted">
                {searchQuery
                  ? `No dishes found matching "${searchQuery}".`
                  : 'No items in this category. Use the form below to add your first dish.'}
              </p>
            </div>
          )}

          {filteredItems.length > 0 && (
            <div className="menu-table">
              <div className="menu-row menu-row-head">
                <span>Item Name</span>
                <span>Category</span>
                <span>SKU</span>
                <span>Price ({currencySymbol})</span>
                <span>Availability</span>
                <span className="actions-header">Actions</span>
              </div>
              {filteredItems.map((item) => (
                <div className={`menu-row ${!item.isAvailable ? 'item-unavailable' : ''}`} key={item.id}>
                  <span className="menu-item-name">
                    <strong>{item.name}</strong>
                  </span>
                  <span className="muted menu-cat-name">{categoryName_ById.get(item.categoryId) ?? '—'}</span>
                  <span className="menu-sku">{item.sku}</span>
                  <span className="menu-price-col">
                    {editingId === item.id ? (
                      <div className="inline-price-edit">
                        <input
                          className="menu-price-input"
                          autoFocus
                          type="number"
                          step="0.01"
                          min="0"
                          value={editingPrice}
                          onChange={(e) => setEditingPrice(e.target.value)}
                          onBlur={() => savePrice(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') savePrice(item)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                        />
                        <button type="button" className="save-price-btn" onClick={() => savePrice(item)}>
                          <Icon name="check" size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="menu-price-edit"
                        onClick={() => startEditPrice(item)}
                        title="Click to edit price"
                      >
                        {formatMoney(item.price, currencySymbol)}
                        <Icon name="edit" size={12} className="price-edit-icon" />
                      </button>
                    )}
                  </span>
                  <span>
                    <button
                      type="button"
                      className={`menu-toggle ${item.isAvailable ? 'on' : 'off'}`}
                      onClick={() => toggleAvailability(item)}
                      aria-pressed={item.isAvailable}
                      title={item.isAvailable ? 'In Stock (Click to 86)' : '86\'d Unavailable (Click to restock)'}
                    >
                      <i />
                      <span className="toggle-label">{item.isAvailable ? 'In Stock' : '86\'d'}</span>
                    </button>
                  </span>
                  <span className="inventory-row-actions">
                    <button
                      type="button"
                      className="menu-archive"
                      onClick={() => archive(item)}
                      title="Archive Item"
                    >
                      <Icon name="trash" size={14} /> Archive
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Clean, Polished Add Item Form Card */}
          <form className="menu-add-form menu-add-item-card" onSubmit={submitItem}>
            <div className="form-card-header">
              <Icon name="plus" size={15} />
              <strong>Add New Menu Item</strong>
            </div>
            <div className="menu-add-fields">
              <div className="menu-field-col">
                <label htmlFor="cat-select-field">Category</label>
                <select
                  id="cat-select-field"
                  value={itemCategoryId}
                  onChange={(e) => setItemCategoryId(e.target.value)}
                  disabled={categories.length === 0}
                  required
                >
                  {categories.length === 0 && <option value="">Add category first</option>}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="menu-field-col flex-grow">
                <label htmlFor="name-input-field">Item Name</label>
                <input
                  id="name-input-field"
                  placeholder="e.g. Wagyu Ribeye Steak"
                  value={itemName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                />
              </div>

              <div className="menu-field-col">
                <label htmlFor="sku-input-field">SKU Code</label>
                <input
                  id="sku-input-field"
                  placeholder="e.g. STEAK01"
                  value={itemSku}
                  onChange={(e) => setItemSku(e.target.value.toUpperCase())}
                  className="font-mono"
                  required
                />
              </div>

              <div className="menu-field-col">
                <label htmlFor="price-input-field">Price ({currencySymbol})</label>
                <input
                  id="price-input-field"
                  placeholder="0.00"
                  inputMode="decimal"
                  type="number"
                  step="0.01"
                  min="0"
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                  required
                />
              </div>

              <button
                className="add-item-submit-btn"
                type="submit"
                disabled={savingItem || categories.length === 0}
              >
                {savingItem ? 'Adding…' : 'Add Item'}
              </button>
            </div>
            {itemError && (
              <div className="alert error menu-form-error">
                <Icon name="alertTriangle" size={14} /> {itemError}
              </div>
            )}
          </form>
        </div>

        {/* Right Column: Categories Management */}
        <aside className="section-card menu-categories-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Structure</p>
              <h2>Categories ({categories.length})</h2>
            </div>
          </div>

          {categories.length === 0 && <p className="muted menu-empty">No categories created yet.</p>}

          <div className="menu-category-list">
            {categories.map((c) => {
              const count = activeItems.filter((i) => i.categoryId === c.id).length
              return (
                <div className="cat-chip-card" key={c.id}>
                  <div className="cat-chip-left">
                    <Icon name="tag" size={14} />
                    <strong>{c.name}</strong>
                  </div>
                  <div className="cat-chip-right">
                    <span className="cat-chip-count">{count} items</span>
                    <button
                      type="button"
                      className="cat-delete-btn"
                      onClick={() => handleDeleteCategory(c)}
                      title={`Delete "${c.name}" category`}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <form className="menu-add-form menu-add-cat-card" onSubmit={submitCategory}>
            <div className="form-card-header">
              <Icon name="plus" size={15} />
              <strong>New Category</strong>
            </div>
            <div className="menu-add-fields-category">
              <input
                placeholder="e.g. Starters, Mains, Desserts"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                required
              />
              <button
                className="add-cat-submit-btn"
                type="submit"
                disabled={savingCategory || !categoryName.trim()}
              >
                {savingCategory ? 'Adding…' : 'Add Category'}
              </button>
            </div>
            {categoryError && (
              <div className="alert error menu-form-error">
                <Icon name="alertTriangle" size={14} /> {categoryError}
              </div>
            )}
          </form>
        </aside>
      </section>
    </main>
  )
}

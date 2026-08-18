import { FormEvent, useEffect, useMemo, useState } from 'react'
import { archiveItem, createCategory, createItem, getCategories, getItems, setAvailability, updateItem } from './api'
import type { Category, MenuItem } from './types'

const currency = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 0,
})

export function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

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

  const submitCategory = async (event: FormEvent) => {
    event.preventDefault()
    setCategoryError('')
    setSavingCategory(true)
    try {
      await createCategory(categoryName.trim(), categories.length)
      setCategoryName('')
      await refetch()
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'Failed to add category.')
    } finally {
      setSavingCategory(false)
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
      setItemName('')
      setItemSku('')
      setItemPrice('')
      await refetch()
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
    await updateItem(item.id, item.name, price, item.categoryId)
    await refetch()
  }

  const toggleAvailability = async (item: MenuItem) => {
    await setAvailability(item.id, !item.isAvailable)
    await refetch()
  }

  const archive = async (item: MenuItem) => {
    await archiveItem(item.id)
    await refetch()
  }

  if (loading) {
    return (
      <main className="content menu-content">
        <p className="muted">Loading menu…</p>
      </main>
    )
  }

  return (
    <main className="content menu-content">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Business module</p>
          <h1>Menu &amp; Catalog</h1>
          <p className="muted">Categories and items here feed the POS product grid directly.</p>
        </div>
      </div>

      {loadError && <div className="alert error">{loadError}</div>}

      <section className="dashboard-grid menu-grid">
        <div className="section-card">
          <div className="section-heading">
            <div><p className="eyebrow">Catalog</p><h2>Items</h2></div>
          </div>

          {items.length === 0 && <p className="muted menu-empty">No items yet. Add a category, then add an item.</p>}

          {items.length > 0 && (
            <div className="menu-table">
              <div className="menu-row menu-row-head">
                <span>Item</span>
                <span>Category</span>
                <span>SKU</span>
                <span>Price</span>
                <span>Available</span>
                <span></span>
              </div>
              {items.map((item) => (
                <div className="menu-row" key={item.id}>
                  <span className="menu-item-name">{item.name}</span>
                  <span className="muted">{categoryName_ById.get(item.categoryId) ?? '—'}</span>
                  <span className="menu-sku">{item.sku}</span>
                  <span>
                    {editingId === item.id ? (
                      <input
                        className="menu-price-input"
                        autoFocus
                        value={editingPrice}
                        onChange={(e) => setEditingPrice(e.target.value)}
                        onBlur={() => savePrice(item)}
                        onKeyDown={(e) => e.key === 'Enter' && savePrice(item)}
                      />
                    ) : (
                      <button className="menu-price-edit" onClick={() => startEditPrice(item)}>
                        {currency.format(item.price)}
                      </button>
                    )}
                  </span>
                  <span>
                    <button
                      className={`menu-toggle ${item.isAvailable ? 'on' : ''}`}
                      onClick={() => toggleAvailability(item)}
                      aria-pressed={item.isAvailable}
                      aria-label={`Toggle availability for ${item.name}`}
                    >
                      <i />
                    </button>
                  </span>
                  <span>
                    <button className="menu-archive" onClick={() => archive(item)}>Archive</button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <form className="menu-add-form" onSubmit={submitItem}>
            <p className="eyebrow">Add item</p>
            <div className="menu-add-fields">
              <select value={itemCategoryId} onChange={(e) => setItemCategoryId(e.target.value)} disabled={categories.length === 0}>
                {categories.length === 0 && <option value="">Add a category first</option>}
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input placeholder="Item name" value={itemName} onChange={(e) => setItemName(e.target.value)} />
              <input placeholder="SKU" value={itemSku} onChange={(e) => setItemSku(e.target.value)} />
              <input placeholder="Price" inputMode="decimal" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} />
              <button className="primary-button" type="submit" disabled={savingItem || categories.length === 0}>
                {savingItem ? 'Adding…' : 'Add item'}
              </button>
            </div>
            {itemError && <div className="alert error">{itemError}</div>}
          </form>
        </div>

        <aside className="section-card">
          <div className="section-heading">
            <div><p className="eyebrow">Structure</p><h2>Categories</h2></div>
          </div>

          {categories.length === 0 && <p className="muted menu-empty">No categories yet.</p>}

          <div className="menu-category-list">
            {categories.map((c) => <span className="quiet-pill" key={c.id}>{c.name}</span>)}
          </div>

          <form className="menu-add-form" onSubmit={submitCategory}>
            <p className="eyebrow">Add category</p>
            <div className="menu-add-fields menu-add-fields-category">
              <input placeholder="Category name" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
              <button className="secondary-button" type="submit" disabled={savingCategory || !categoryName.trim()}>
                {savingCategory ? 'Adding…' : 'Add category'}
              </button>
            </div>
            {categoryError && <div className="alert error">{categoryError}</div>}
          </form>
        </aside>
      </section>
    </main>
  )
}

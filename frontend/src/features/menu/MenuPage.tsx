import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { getItems as getStockItems } from '../inventory/api'
import type { StockItem } from '../inventory/types'
import { archiveItem, createCategory, createItem, getCategories, getItems, getRecipe, saveRecipe, setAvailability, updateItem } from './api'
import { STATIONS, type Category, type MenuItem, type Recipe } from './types'

const currency = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 0,
})

type RecipeLineDraft = { stockItemId: string; quantity: string; unit: string }

export function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [categoryName, setCategoryName] = useState('')
  const [categoryStation, setCategoryStation] = useState('')
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

  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null)
  const [recipeYield, setRecipeYield] = useState('1')
  const [recipeLines, setRecipeLines] = useState<RecipeLineDraft[]>([])
  const [recipeError, setRecipeError] = useState('')
  const [recipeSaving, setRecipeSaving] = useState(false)
  const [savedRecipe, setSavedRecipe] = useState<Recipe | null>(null)

  const categoryName_ById = useMemo(() => {
    const map = new Map<string, string>()
    categories.forEach((c) => map.set(c.id, c.name))
    return map
  }, [categories])

  const stockItemById = useMemo(() => {
    const map = new Map<string, StockItem>()
    stockItems.forEach((s) => map.set(s.id, s))
    return map
  }, [stockItems])

  const refetch = async () => {
    const [nextCategories, nextItems, nextStock] = await Promise.all([getCategories(), getItems(), getStockItems()])
    setCategories(nextCategories)
    setItems(nextItems)
    setStockItems(nextStock)
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
      await createCategory(categoryName.trim(), categories.length, categoryStation || undefined)
      setCategoryName('')
      setCategoryStation('')
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

  const openRecipe = async (item: MenuItem) => {
    setRecipeItem(item)
    setRecipeError('')
    setSavedRecipe(null)
    try {
      const recipe = await getRecipe(item.id)
      if (recipe) {
        setRecipeYield(String(recipe.yield))
        setRecipeLines(recipe.lines.map((l) => ({ stockItemId: l.stockItemId, quantity: String(l.quantity), unit: l.unit })))
      } else {
        setRecipeYield('1')
        setRecipeLines([])
      }
    } catch (err) {
      setRecipeError(err instanceof Error ? err.message : 'Failed to load recipe.')
    }
  }

  const addRecipeLine = () => {
    const first = stockItems[0]
    setRecipeLines((current) => [...current, { stockItemId: first?.id ?? '', quantity: '', unit: first?.recipeUnit ?? '' }])
  }

  const updateRecipeLine = (index: number, patch: Partial<RecipeLineDraft>) => {
    setRecipeLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  const removeRecipeLine = (index: number) => {
    setRecipeLines((current) => current.filter((_, i) => i !== index))
  }

  const livePreview = useMemo(() => {
    const yieldNum = Number(recipeYield) || 1
    let totalCost = 0
    for (const line of recipeLines) {
      const stock = stockItemById.get(line.stockItemId)
      const qty = Number(line.quantity)
      if (!stock || !Number.isFinite(qty)) continue
      const factor = stock.conversionFactor > 0 ? stock.conversionFactor : 1
      totalCost += (qty / factor) * stock.cost
    }
    const costPerServing = yieldNum > 0 ? totalCost / yieldNum : totalCost
    const price = recipeItem?.price ?? 0
    const foodCostPercentage = price > 0 ? Math.round((costPerServing / price) * 10000) / 100 : null
    return { totalCost, costPerServing, foodCostPercentage }
  }, [recipeLines, recipeYield, stockItemById, recipeItem])

  const submitRecipe = async (event: FormEvent) => {
    event.preventDefault()
    if (!recipeItem) return
    setRecipeError('')

    const yieldNum = Number(recipeYield)
    if (!Number.isFinite(yieldNum) || yieldNum < 1) return setRecipeError('Yield must be at least 1.')
    if (recipeLines.length === 0) return setRecipeError('Add at least one ingredient.')
    for (const line of recipeLines) {
      if (!line.stockItemId) return setRecipeError('Choose an ingredient for every line.')
      const qty = Number(line.quantity)
      if (!Number.isFinite(qty) || qty <= 0) return setRecipeError('Each line needs a positive quantity.')
      if (!line.unit.trim()) return setRecipeError('Each line needs a unit.')
    }

    setRecipeSaving(true)
    try {
      const saved = await saveRecipe(
        recipeItem.id,
        yieldNum,
        recipeLines.map((l) => ({ stockItemId: l.stockItemId, quantity: Number(l.quantity), unit: l.unit.trim() }))
      )
      setSavedRecipe(saved)
    } catch (err) {
      setRecipeError(err instanceof Error ? err.message : 'Failed to save recipe.')
    } finally {
      setRecipeSaving(false)
    }
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
                  <span className="inventory-row-actions">
                    <button className="menu-price-edit" onClick={() => openRecipe(item)}>Recipe</button>
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
            {categories.map((c) => (
              <span className="quiet-pill" key={c.id}>{c.name}{c.station ? ` · ${c.station}` : ''}</span>
            ))}
          </div>

          <form className="menu-add-form" onSubmit={submitCategory}>
            <p className="eyebrow">Add category</p>
            <div className="menu-add-fields menu-add-fields-category">
              <input placeholder="Category name" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
              <select value={categoryStation} onChange={(e) => setCategoryStation(e.target.value)}>
                <option value="">No station</option>
                {STATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="secondary-button" type="submit" disabled={savingCategory || !categoryName.trim()}>
                {savingCategory ? 'Adding…' : 'Add category'}
              </button>
            </div>
            {categoryError && <div className="alert error">{categoryError}</div>}
          </form>
        </aside>
      </section>

      {recipeItem && (
        <div className="sheet-backdrop" onMouseDown={() => setRecipeItem(null)}>
          <section className="payment-sheet order-detail-sheet" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-header">
              <div>
                <span className="overline">Recipe</span>
                <h2>{recipeItem.name}</h2>
              </div>
              <button className="icon-button" onClick={() => setRecipeItem(null)}><Icon name="close" /></button>
            </div>

            <form onSubmit={submitRecipe} className="recipe-form">
              <label className="recipe-yield-label">
                Yield (servings this batch produces)
                <input inputMode="numeric" value={recipeYield} onChange={(e) => setRecipeYield(e.target.value)} />
              </label>

              <div className="recipe-lines">
                {recipeLines.length === 0 && <p className="muted">No ingredients yet. Add one below.</p>}
                {recipeLines.map((line, index) => (
                  <div className="recipe-line" key={index}>
                    <select value={line.stockItemId} onChange={(e) => updateRecipeLine(index, { stockItemId: e.target.value })}>
                      <option value="">Choose ingredient</option>
                      {stockItems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input
                      inputMode="decimal"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => updateRecipeLine(index, { quantity: e.target.value })}
                    />
                    <input
                      placeholder="Unit"
                      value={line.unit}
                      onChange={(e) => updateRecipeLine(index, { unit: e.target.value })}
                    />
                    <button type="button" className="menu-archive" onClick={() => removeRecipeLine(index)}>Remove</button>
                  </div>
                ))}
                <button type="button" className="secondary-button full-width recipe-add-line" onClick={addRecipeLine} disabled={stockItems.length === 0}>
                  + Add ingredient
                </button>
                {stockItems.length === 0 && <p className="muted">Add stock items in Inventory first.</p>}
              </div>

              <div className="recipe-cost-preview">
                <div><span>Total cost</span><strong>{currency.format(livePreview.totalCost)}</strong></div>
                <div><span>Cost per serving</span><strong>{currency.format(livePreview.costPerServing)}</strong></div>
                <div><span>Food cost %</span><strong>{livePreview.foodCostPercentage ?? '—'}{livePreview.foodCostPercentage !== null ? '%' : ''}</strong></div>
              </div>

              {recipeError && <div className="alert error">{recipeError}</div>}
              <button className="primary-button" type="submit" disabled={recipeSaving}>
                {recipeSaving ? 'Saving…' : 'Save recipe'}
              </button>
              {savedRecipe && !recipeError && <div className="alert success">Recipe saved.</div>}
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

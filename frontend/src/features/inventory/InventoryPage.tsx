import { FormEvent, useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { adjustStock, archiveItem, createItem, getAdjustments, getItems, updateItem } from './api'
import type { StockAdjustment, StockItem } from './types'

const currency = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 0,
})

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: '2-digit' })

function stockBadge(item: StockItem) {
  if (item.quantity <= 0) return <span className="order-status-badge cancelled">Out of stock</span>
  if (item.quantity <= item.reorderLevel) return <span className="order-status-badge sent">Low stock</span>
  return null
}

type EditDraft = { name: string; sku: string; unit: string; parLevel: string; reorderLevel: string; cost: string }

export function InventoryPage() {
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [unit, setUnit] = useState('')
  const [parLevel, setParLevel] = useState('')
  const [reorderLevel, setReorderLevel] = useState('')
  const [cost, setCost] = useState('')
  const [initialQuantity, setInitialQuantity] = useState('')
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: '', sku: '', unit: '', parLevel: '', reorderLevel: '', cost: '' })
  const [editError, setEditError] = useState('')

  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null)
  const [adjustDelta, setAdjustDelta] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustError, setAdjustError] = useState('')
  const [adjustSaving, setAdjustSaving] = useState(false)
  const [history, setHistory] = useState<StockAdjustment[]>([])

  const refetch = () => getItems().then(setItems)

  useEffect(() => {
    refetch()
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load inventory.'))
      .finally(() => setLoading(false))
  }, [])

  const submitAdd = async (event: FormEvent) => {
    event.preventDefault()
    setAddError('')

    const par = Number(parLevel || 0)
    const reorder = Number(reorderLevel || 0)
    const costValue = Number(cost || 0)
    const qty = Number(initialQuantity || 0)

    if (!name.trim() || !sku.trim() || !unit.trim()) return setAddError('Name, SKU and unit are required.')
    if ([par, reorder, costValue, qty].some((v) => !Number.isFinite(v) || v < 0)) return setAddError('Enter valid, non-negative numbers.')

    setSaving(true)
    try {
      await createItem({ name: name.trim(), sku: sku.trim(), unit: unit.trim(), parLevel: par, reorderLevel: reorder, cost: costValue, initialQuantity: qty })
      setName(''); setSku(''); setUnit(''); setParLevel(''); setReorderLevel(''); setCost(''); setInitialQuantity('')
      await refetch()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add stock item.')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (item: StockItem) => {
    setEditingId(item.id)
    setEditError('')
    setEditDraft({
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      parLevel: String(item.parLevel),
      reorderLevel: String(item.reorderLevel),
      cost: String(item.cost),
    })
  }

  const saveEdit = async (item: StockItem) => {
    setEditError('')
    const par = Number(editDraft.parLevel)
    const reorder = Number(editDraft.reorderLevel)
    const costValue = Number(editDraft.cost)

    if (!editDraft.name.trim() || !editDraft.sku.trim() || !editDraft.unit.trim()) return setEditError('Name, SKU and unit are required.')
    if ([par, reorder, costValue].some((v) => !Number.isFinite(v) || v < 0)) return setEditError('Enter valid, non-negative numbers.')

    try {
      await updateItem(item.id, {
        name: editDraft.name.trim(), sku: editDraft.sku.trim(), unit: editDraft.unit.trim(),
        parLevel: par, reorderLevel: reorder, cost: costValue,
      })
      setEditingId(null)
      await refetch()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update stock item.')
    }
  }

  const archive = async (item: StockItem) => {
    await archiveItem(item.id)
    await refetch()
  }

  const openAdjust = async (item: StockItem) => {
    setAdjustItem(item)
    setAdjustDelta('')
    setAdjustReason('')
    setAdjustError('')
    setHistory([])
    try {
      setHistory(await getAdjustments(item.id))
    } catch {
      // history is a nice-to-have; ignore failures
    }
  }

  const submitAdjust = async (event: FormEvent) => {
    event.preventDefault()
    if (!adjustItem) return
    setAdjustError('')

    const delta = Number(adjustDelta)
    if (!Number.isFinite(delta) || delta === 0) return setAdjustError('Enter a non-zero quantity change.')
    if (!adjustReason.trim()) return setAdjustError('A reason is required.')

    setAdjustSaving(true)
    try {
      const updated = await adjustStock(adjustItem.id, delta, adjustReason.trim())
      setAdjustItem(updated)
      setAdjustDelta('')
      setAdjustReason('')
      setHistory(await getAdjustments(adjustItem.id))
      await refetch()
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : 'Failed to adjust stock.')
    } finally {
      setAdjustSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="content menu-content">
        <p className="muted">Loading inventory…</p>
      </main>
    )
  }

  return (
    <main className="content menu-content">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Business module</p>
          <h1>Inventory</h1>
          <p className="muted">Stock levels, par/reorder thresholds and a full adjustment history.</p>
        </div>
      </div>

      {loadError && <div className="alert error">{loadError}</div>}

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Stock</p><h2>Items</h2></div>
        </div>

        {items.length === 0 && <p className="muted menu-empty">No stock items yet. Add one below.</p>}

        {items.length > 0 && (
          <div className="menu-table inventory-table">
            <div className="menu-row menu-row-head inventory-row">
              <span>Item</span>
              <span>SKU</span>
              <span>Unit</span>
              <span>Quantity</span>
              <span>Par</span>
              <span>Reorder</span>
              <span>Cost</span>
              <span></span>
            </div>
            {items.map((item) => (
              <div className="menu-row inventory-row" key={item.id}>
                {editingId === item.id ? (
                  <>
                    <input className="inventory-edit-input" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                    <input className="inventory-edit-input" value={editDraft.sku} onChange={(e) => setEditDraft({ ...editDraft, sku: e.target.value })} />
                    <input className="inventory-edit-input" value={editDraft.unit} onChange={(e) => setEditDraft({ ...editDraft, unit: e.target.value })} />
                    <span className="muted">{item.quantity}</span>
                    <input className="inventory-edit-input" value={editDraft.parLevel} onChange={(e) => setEditDraft({ ...editDraft, parLevel: e.target.value })} />
                    <input className="inventory-edit-input" value={editDraft.reorderLevel} onChange={(e) => setEditDraft({ ...editDraft, reorderLevel: e.target.value })} />
                    <input className="inventory-edit-input" value={editDraft.cost} onChange={(e) => setEditDraft({ ...editDraft, cost: e.target.value })} />
                    <span className="inventory-row-actions">
                      <button className="menu-price-edit" onClick={() => saveEdit(item)}>Save</button>
                      <button className="menu-archive" onClick={() => setEditingId(null)}>Cancel</button>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="menu-item-name">{item.name}</span>
                    <span className="menu-sku">{item.sku}</span>
                    <span className="muted">{item.unit}</span>
                    <span>{item.quantity} {stockBadge(item)}</span>
                    <span className="muted">{item.parLevel}</span>
                    <span className="muted">{item.reorderLevel}</span>
                    <span className="muted">{currency.format(item.cost)}</span>
                    <span className="inventory-row-actions">
                      <button className="menu-price-edit" onClick={() => startEdit(item)}>Edit</button>
                      <button className="menu-price-edit" onClick={() => openAdjust(item)}>Adjust</button>
                      <button className="menu-archive" onClick={() => archive(item)}>Archive</button>
                    </span>
                  </>
                )}
              </div>
            ))}
            {editingId && editError && <div className="alert error inventory-edit-error">{editError}</div>}
          </div>
        )}

        <form className="menu-add-form" onSubmit={submitAdd}>
          <p className="eyebrow">Add stock item</p>
          <div className="menu-add-fields inventory-add-fields">
            <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <input placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
            <input placeholder="Unit (e.g. kg)" value={unit} onChange={(e) => setUnit(e.target.value)} />
            <input placeholder="Par level" inputMode="decimal" value={parLevel} onChange={(e) => setParLevel(e.target.value)} />
            <input placeholder="Reorder level" inputMode="decimal" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} />
            <input placeholder="Cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
            <input placeholder="Starting qty" inputMode="decimal" value={initialQuantity} onChange={(e) => setInitialQuantity(e.target.value)} />
            <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add item'}</button>
          </div>
          {addError && <div className="alert error">{addError}</div>}
        </form>
      </section>

      {adjustItem && (
        <div className="sheet-backdrop" onMouseDown={() => setAdjustItem(null)}>
          <section className="payment-sheet order-detail-sheet" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-header">
              <div>
                <span className="overline">Adjust stock</span>
                <h2>{adjustItem.name}</h2>
              </div>
              <button className="icon-button" onClick={() => setAdjustItem(null)}><Icon name="close" /></button>
            </div>

            <p className="muted order-detail-time">Current quantity: {adjustItem.quantity} {adjustItem.unit}</p>

            <form onSubmit={submitAdjust} className="inventory-adjust-form">
              <label>
                Quantity change (use negative to remove)
                <input inputMode="decimal" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} />
              </label>
              <label>
                Reason
                <input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="e.g. Received delivery, waste, count correction" />
              </label>
              {adjustError && <div className="alert error">{adjustError}</div>}
              <button className="primary-button" type="submit" disabled={adjustSaving}>{adjustSaving ? 'Saving…' : 'Apply adjustment'}</button>
            </form>

            <div className="order-detail-lines inventory-history">
              <p className="eyebrow">History</p>
              {history.length === 0 && <p className="muted">No adjustments yet.</p>}
              {history.map((entry) => (
                <div className="order-detail-line inventory-history-line" key={entry.id}>
                  <span>
                    <strong>{entry.quantityBefore} → {entry.quantityAfter}</strong> ({entry.delta > 0 ? '+' : ''}{entry.delta})
                    <br /><span className="muted">{entry.reason}</span>
                  </span>
                  <span className="muted">{timeFormat.format(new Date(entry.createdAt))}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

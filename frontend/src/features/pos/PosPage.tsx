import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { getCatalog } from '../menu/api'
import type { Category, MenuItem } from '../menu/types'
import { completeOrder, createCompletedOrder, sendToKitchen } from '../orders/api'

type OrderLine = MenuItem & { quantity: number; notes?: string }

export type RestaurantTable = {
  id: string
  name: string
  section: string
  capacity: number
  status: 'available' | 'occupied' | 'reserved'
}

const defaultTables: RestaurantTable[] = [
  { id: 't1', name: 'Table 01', section: 'Main Dining', capacity: 2, status: 'available' },
  { id: 't2', name: 'Table 02', section: 'Main Dining', capacity: 2, status: 'available' },
  { id: 't3', name: 'Table 03', section: 'Main Dining', capacity: 4, status: 'available' },
  { id: 't4', name: 'Table 04', section: 'Main Dining', capacity: 4, status: 'available' },
  { id: 't5', name: 'Table 05', section: 'Main Dining', capacity: 6, status: 'available' },
  { id: 't12', name: 'Table 12', section: 'Main Dining', capacity: 4, status: 'occupied' },
  { id: 't14', name: 'Table 14', section: 'Main Dining', capacity: 8, status: 'reserved' },
  { id: 'p1', name: 'Patio 01', section: 'Patio', capacity: 4, status: 'available' },
  { id: 'p2', name: 'Patio 02', section: 'Patio', capacity: 4, status: 'available' },
  { id: 'p3', name: 'Patio 03', section: 'Patio', capacity: 6, status: 'occupied' },
  { id: 'b1', name: 'Bar 01', section: 'Bar & Lounge', capacity: 1, status: 'available' },
  { id: 'b2', name: 'Bar 02', section: 'Bar & Lounge', capacity: 1, status: 'available' },
  { id: 'b3', name: 'Bar 03', section: 'Bar & Lounge', capacity: 1, status: 'occupied' },
  { id: 'l1', name: 'Lounge A', section: 'Bar & Lounge', capacity: 6, status: 'available' },
  { id: 'bt1', name: 'Booth 01', section: 'Private Booths', capacity: 4, status: 'available' },
  { id: 'bt2', name: 'Booth 02', section: 'Private Booths', capacity: 4, status: 'reserved' },
]

const currency = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 0,
})

function monogram(name: string) {
  const words = name.trim().split(/\s+/)
  return words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

export function PosPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [category, setCategory] = useState('all')
  const [serviceMode, setServiceMode] = useState<'Dine in' | 'Takeaway' | 'Delivery'>('Dine in')
  const [search, setSearch] = useState('')
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [order, setOrder] = useState<OrderLine[]>([])

  // Tables & Guests State
  const [tables, setTables] = useState<RestaurantTable[]>(() => {
    const saved = localStorage.getItem('zipflow_pos_tables')
    return saved ? JSON.parse(saved) : defaultTables
  })
  const [selectedTable, setSelectedTable] = useState<RestaurantTable>(() => {
    return defaultTables.find((t) => t.id === 't12') || defaultTables[0]
  })
  const [tableModalOpen, setTableModalOpen] = useState(false)
  const [tableSectionFilter, setTableSectionFilter] = useState('all')
  const [newTableFormOpen, setNewTableFormOpen] = useState(false)
  const [newTableName, setNewTableName] = useState('')
  const [newTableSection, setNewTableSection] = useState('Main Dining')
  const [newTableCapacity, setNewTableCapacity] = useState(4)

  const [guestCount, setGuestCount] = useState(3)
  const [guestPickerOpen, setGuestPickerOpen] = useState(false)

  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [paying, setPaying] = useState(false)
  const [actionError, setActionError] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const locked = currentOrderId !== null

  useEffect(() => {
    localStorage.setItem('zipflow_pos_tables', JSON.stringify(tables))
  }, [tables])

  useEffect(() => {
    getCatalog()
      .then((catalog) => {
        setCategories(catalog.categories)
        setProducts(catalog.items)
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load the menu.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!confirmation) return
    const timer = window.setTimeout(() => setConfirmation(''), 4000)
    return () => window.clearTimeout(timer)
  }, [confirmation])

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => {
      const categoryMatch = category === 'all' || product.categoryId === category
      const searchMatch = !query || product.name.toLowerCase().includes(query)
      return categoryMatch && searchMatch
    })
  }, [products, category, search])

  const tableSections = useMemo(() => {
    const set = new Set(tables.map((t) => t.section))
    return ['all', ...Array.from(set)]
  }, [tables])

  const visibleTables = useMemo(() => {
    if (tableSectionFilter === 'all') return tables
    return tables.filter((t) => t.section === tableSectionFilter)
  }, [tables, tableSectionFilter])

  const subtotal = order.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const tax = Math.round(subtotal * 0.1)
  const total = subtotal + tax

  const addProduct = (product: MenuItem) => {
    if (locked) return
    setOrder((current) => {
      const existing = current.find((line) => line.id === product.id)
      if (existing) {
        return current.map((line) => (line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line))
      }
      return [...current, { ...product, quantity: 1 }]
    })
  }

  const changeQuantity = (id: string, delta: number) => {
    if (locked) return
    setOrder((current) =>
      current
        .map((line) => (line.id === id ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0)
    )
  }

  const removeLine = (id: string) => {
    if (locked) return
    setOrder((current) => current.filter((item) => item.id !== id))
  }

  const updateNotes = (id: string, notes: string) => {
    if (locked) return
    setOrder((current) => current.map((line) => (line.id === id ? { ...line, notes } : line)))
  }

  const resetOrder = () => {
    setOrder([])
    setCurrentOrderId(null)
  }

  const handleSendToKitchen = async () => {
    setActionError('')
    setSending(true)
    try {
      const created = await sendToKitchen(
        serviceMode,
        order.map((line) => ({ menuItemId: line.id, quantity: line.quantity, notes: line.notes }))
      )
      setCurrentOrderId(created.id)
      setConfirmation('Sent to kitchen.')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send order to kitchen.')
    } finally {
      setSending(false)
    }
  }

  const handlePay = async (method: 'Cash' | 'Card') => {
    setActionError('')
    setPaying(true)
    try {
      if (currentOrderId) {
        await completeOrder(currentOrderId, method)
      } else {
        await createCompletedOrder(
          serviceMode,
          method,
          order.map((line) => ({ menuItemId: line.id, quantity: line.quantity, notes: line.notes }))
        )
      }
      setPaymentOpen(false)
      resetOrder()
      setConfirmation(`Payment completed (${method}).`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to complete payment.')
    } finally {
      setPaying(false)
    }
  }

  const handleAddTable = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTableName.trim()) return

    const newTbl: RestaurantTable = {
      id: `tbl_${Date.now()}`,
      name: newTableName.trim(),
      section: newTableSection,
      capacity: Number(newTableCapacity) || 4,
      status: 'available',
    }

    setTables((prev) => [...prev, newTbl])
    setSelectedTable(newTbl)
    setNewTableName('')
    setNewTableFormOpen(false)
    setTableModalOpen(false)
    setConfirmation(`Created and selected ${newTbl.name}`)
  }

  return (
    <main className="pos-page">
      <section className="pos-catalog">
        <div className="pos-toolbar">
          <div className="service-switcher" role="group" aria-label="Service mode">
            {(['Dine in', 'Takeaway', 'Delivery'] as const).map((mode) => (
              <button
                key={mode}
                className={serviceMode === mode ? 'active' : ''}
                onClick={() => setServiceMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>

          <label className="pos-search">
            <Icon name="search" />
            <input
              placeholder="Search products"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        <div className="category-tabs" role="tablist" aria-label="Menu categories">
          <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>
            All
          </button>
          {categories.map((item) => (
            <button
              key={item.id}
              className={category === item.id ? 'active' : ''}
              onClick={() => setCategory(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>

        {loadError && <div className="alert error pos-load-error">{loadError}</div>}

        {!loadError && loading && <p className="muted pos-load-status">Loading menu…</p>}

        {!loadError && !loading && products.length === 0 && (
          <p className="muted pos-load-status">No menu items yet. Add categories and items from Menu &amp; Catalog.</p>
        )}

        <div className="product-grid">
          {visibleProducts.map((product) => (
            <button className="product-tile" key={product.id} onClick={() => addProduct(product)} disabled={locked}>
              <span className="product-monogram">{monogram(product.name)}</span>
              <span className="product-copy">
                <strong>{product.name}</strong>
                <small>{product.sku}</small>
              </span>
              <span className="product-price">{currency.format(product.price)}</span>
              <span className="product-add">
                <Icon name="plus" />
              </span>
            </button>
          ))}
        </div>
      </section>

      <aside className="order-panel">
        <div className="order-header">
          <div>
            <span className="overline">Current order</span>
            {serviceMode === 'Dine in' ? (
              <button
                type="button"
                className="pos-table-selector-btn"
                onClick={() => setTableModalOpen(true)}
                title="Change Table"
              >
                <h1>{selectedTable.name}</h1>
                <span className="table-change-badge">Change</span>
              </button>
            ) : (
              <h1>{serviceMode}</h1>
            )}
          </div>

          <div className="order-header-right">
            {locked ? (
              <span className="quiet-pill order-sent-pill">Sent to kitchen</span>
            ) : (
              <div className="guest-selector-container">
                <button
                  type="button"
                  className="order-meta guest-chip-btn"
                  onClick={() => setGuestPickerOpen((prev) => !prev)}
                >
                  <Icon name="user" size={13} />
                  <span>
                    {guestCount} {guestCount === 1 ? 'guest' : 'guests'}
                  </span>
                  <Icon name="chevronDown" size={12} />
                </button>

                {guestPickerOpen && (
                  <div className="guest-dropdown-popover">
                    <div className="guest-popover-header">
                      <strong>Select Guests</strong>
                      <button
                        type="button"
                        className="guest-popover-close"
                        onClick={() => setGuestPickerOpen(false)}
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </div>

                    <div className="guest-quick-grid">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((num) => (
                        <button
                          key={num}
                          type="button"
                          className={`guest-quick-num ${guestCount === num ? 'active' : ''}`}
                          onClick={() => {
                            setGuestCount(num)
                            setGuestPickerOpen(false)
                          }}
                        >
                          {num}
                        </button>
                      ))}
                    </div>

                    <div className="guest-stepper-row">
                      <span>Custom count</span>
                      <div className="guest-stepper-controls">
                        <button
                          type="button"
                          onClick={() => setGuestCount((g) => Math.max(1, g - 1))}
                          disabled={guestCount <= 1}
                        >
                          <Icon name="minus" size={12} />
                        </button>
                        <strong>{guestCount}</strong>
                        <button
                          type="button"
                          onClick={() => setGuestCount((g) => g + 1)}
                        >
                          <Icon name="plus" size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="order-context">
          <span>Order #1048</span>
          <span>Alex Morgan</span>
          {serviceMode === 'Dine in' && <span className="order-context-section">{selectedTable.section}</span>}
        </div>

        <div className="order-lines">
          {confirmation && <div className="alert success pos-confirmation">{confirmation}</div>}
          {actionError && <div className="alert error pos-confirmation">{actionError}</div>}

          {order.length === 0 && (
            <div className="empty-order">
              <div className="empty-order-icon">
                <Icon name="receipt" />
              </div>
              <strong>No items yet</strong>
              <span>Tap a product to start the order.</span>
            </div>
          )}

          {order.map((line) => (
            <article className={`order-line ${locked ? 'locked' : ''}`} key={line.id}>
              <div className="order-line-main">
                <span className="line-qty">{line.quantity}×</span>
                <div>
                  <strong>{line.name}</strong>
                </div>
                <strong>{currency.format(line.price * line.quantity)}</strong>
              </div>
              <div className="line-actions">
                <button
                  onClick={() => changeQuantity(line.id, -1)}
                  disabled={locked}
                  aria-label={`Remove one ${line.name}`}
                >
                  <Icon name="minus" />
                </button>
                <span>{line.quantity}</span>
                <button
                  onClick={() => changeQuantity(line.id, 1)}
                  disabled={locked}
                  aria-label={`Add one ${line.name}`}
                >
                  <Icon name="plus" />
                </button>
                <button
                  className="line-delete"
                  onClick={() => removeLine(line.id)}
                  disabled={locked}
                  aria-label={`Delete ${line.name}`}
                >
                  <Icon name="trash" />
                </button>
              </div>
              {!locked && (
                <input
                  className="line-note-input"
                  placeholder="Add a note (e.g. no onion)"
                  value={line.notes ?? ''}
                  onChange={(e) => updateNotes(line.id, e.target.value)}
                />
              )}
              {locked && line.notes && <p className="line-note-readonly">{line.notes}</p>}
            </article>
          ))}
        </div>

        <div className="order-summary">
          <div>
            <span>Subtotal</span>
            <strong>{currency.format(subtotal)}</strong>
          </div>
          <div>
            <span>Tax · 10%</span>
            <strong>{currency.format(tax)}</strong>
          </div>
          <div className="order-total">
            <span>Total</span>
            <strong>{currency.format(total)}</strong>
          </div>
        </div>

        <div className="order-actions">
          <button
            className="send-button"
            disabled={!order.length || locked || sending}
            onClick={handleSendToKitchen}
          >
            {locked ? 'Sent to kitchen' : sending ? 'Sending…' : 'Send to kitchen'}
          </button>
          <button className="pay-button" disabled={!order.length} onClick={() => setPaymentOpen(true)}>
            Pay <span>{currency.format(total)}</span>
          </button>
        </div>
      </aside>

      {/* Table Selector Modal */}
      {tableModalOpen && (
        <div className="modal-backdrop" onClick={() => setTableModalOpen(false)}>
          <div className="modal-card table-selector-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3>Select Table &amp; Seating</h3>
                <p className="text-muted">Choose an active dining table or add a new table to your floor plan.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="pill-btn pill-btn-primary sm"
                  onClick={() => setNewTableFormOpen((prev) => !prev)}
                >
                  <Icon name="plus" size={13} />
                  <span>{newTableFormOpen ? 'Close Form' : 'Add Table'}</span>
                </button>
                <button type="button" className="close-btn" onClick={() => setTableModalOpen(false)}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>

            {/* Add Table Form Dropdown Drawer */}
            {newTableFormOpen && (
              <form onSubmit={handleAddTable} className="new-table-drawer">
                <div className="new-table-form-row">
                  <div className="form-input-group">
                    <label>Table Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Table 15, Patio 04"
                      value={newTableName}
                      onChange={(e) => setNewTableName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="form-input-group">
                    <label>Section</label>
                    <select
                      value={newTableSection}
                      onChange={(e) => setNewTableSection(e.target.value)}
                    >
                      <option value="Main Dining">Main Dining</option>
                      <option value="Patio">Patio</option>
                      <option value="Bar &amp; Lounge">Bar &amp; Lounge</option>
                      <option value="Private Booths">Private Booths</option>
                    </select>
                  </div>

                  <div className="form-input-group" style={{ width: '90px' }}>
                    <label>Capacity</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={newTableCapacity}
                      onChange={(e) => setNewTableCapacity(Number(e.target.value))}
                    />
                  </div>

                  <button type="submit" className="pill-btn pill-btn-primary sm" style={{ alignSelf: 'flex-end', height: '38px' }}>
                    Create Table
                  </button>
                </div>
              </form>
            )}

            {/* Section Filter Tabs */}
            <div className="table-section-tabs">
              {tableSections.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={`table-sec-pill ${tableSectionFilter === sec ? 'active' : ''}`}
                  onClick={() => setTableSectionFilter(sec)}
                >
                  {sec === 'all' ? 'All Sections' : sec}
                </button>
              ))}
            </div>

            {/* Tables Grid */}
            <div className="tables-selection-grid">
              {visibleTables.map((tbl) => {
                const isSelected = selectedTable.id === tbl.id
                return (
                  <button
                    key={tbl.id}
                    type="button"
                    className={`pos-table-card ${isSelected ? 'selected' : ''} status-${tbl.status}`}
                    onClick={() => {
                      setSelectedTable(tbl)
                      setTableModalOpen(false)
                    }}
                  >
                    <div className="table-card-top">
                      <strong>{tbl.name}</strong>
                      <span className={`table-status-dot ${tbl.status}`} />
                    </div>

                    <div className="table-card-middle">
                      <span className="table-section-label">{tbl.section}</span>
                    </div>

                    <div className="table-card-bottom">
                      <span className="table-capacity-chip">
                        <Icon name="user" size={11} /> {tbl.capacity} seats
                      </span>
                      <span className={`table-status-badge ${tbl.status}`}>
                        {tbl.status}
                      </span>
                    </div>

                    {isSelected && (
                      <span className="table-selected-check">
                        <Icon name="check" size={12} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="table-modal-footer">
              <div className="table-legend">
                <span className="legend-chip"><i className="dot available" /> Available</span>
                <span className="legend-chip"><i className="dot occupied" /> Occupied</span>
                <span className="legend-chip"><i className="dot reserved" /> Reserved</span>
              </div>
              <button
                type="button"
                className="pill-btn pill-btn-outline sm"
                onClick={() => setTableModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Sheet */}
      {paymentOpen && (
        <div className="sheet-backdrop" onMouseDown={() => setPaymentOpen(false)}>
          <section className="payment-sheet" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-header">
              <div>
                <span className="overline">Checkout</span>
                <h2>Choose payment method</h2>
              </div>
              <button className="icon-button" onClick={() => setPaymentOpen(false)}>
                <Icon name="close" />
              </button>
            </div>

            <div className="payment-amount">
              <span>Amount due</span>
              <strong>{currency.format(total)}</strong>
            </div>

            {actionError && <div className="alert error">{actionError}</div>}

            <div className="payment-methods">
              <button disabled={paying} onClick={() => handlePay('Card')}>
                <span className="payment-icon">
                  <Icon name="card" />
                </span>
                <strong>Card</strong>
                <small>Terminal payment</small>
              </button>
              <button disabled={paying} onClick={() => handlePay('Cash')}>
                <span className="payment-icon">
                  <Icon name="cash" />
                </span>
                <strong>Cash</strong>
                <small>Cash drawer</small>
              </button>
              <button disabled>
                <span className="payment-icon">
                  <Icon name="split" />
                </span>
                <strong>Split</strong>
                <small>Split the bill</small>
              </button>
            </div>

            <div className="sheet-note">
              <Icon name="spark" />
              <span>This is the UI foundation. Real payment processing is added in the Payments step.</span>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

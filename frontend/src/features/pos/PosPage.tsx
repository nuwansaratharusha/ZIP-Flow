import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { formatMoney } from '../../lib/currency'
import { getCatalog } from '../menu/api'
import type { Category, MenuItem } from '../menu/types'
import { completeOrder, createCompletedOrder, sendToKitchen } from '../orders/api'
import { getCurrencies, getTaxSettings } from '../settings/api'
import { archiveTable, createTable, getTables, updateTable } from '../tables/api'
import { TABLE_SECTIONS, type RestaurantTable } from '../tables/types'

type OrderLine = MenuItem & { quantity: number; notes?: string }
type ActiveCurrency = { code: string; symbol: string; rate: number }

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

  const [currencies, setCurrencies] = useState<ActiveCurrency[]>([])
  const [activeCurrency, setActiveCurrency] = useState<ActiveCurrency>({ code: 'GBP', symbol: '£', rate: 1 })
  const [vatRate, setVatRate] = useState(0)
  const [serviceChargeRate, setServiceChargeRate] = useState(0)
  const [taxSettingsLoaded, setTaxSettingsLoaded] = useState(false)

  // Tables & Guests State
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null)
  const [tableModalOpen, setTableModalOpen] = useState(false)
  const [tableSectionFilter, setTableSectionFilter] = useState('all')
  const [newTableFormOpen, setNewTableFormOpen] = useState(false)
  const [newTableName, setNewTableName] = useState('')
  const [newTableSection, setNewTableSection] = useState<string>(TABLE_SECTIONS[0])
  const [newTableCapacity, setNewTableCapacity] = useState(4)
  const [newTableError, setNewTableError] = useState('')
  const [savingTable, setSavingTable] = useState(false)
  const [editingTableId, setEditingTableId] = useState<string | null>(null)
  const [tablesLoadError, setTablesLoadError] = useState('')
  const [tablesLoading, setTablesLoading] = useState(false)

  const [guestCount, setGuestCount] = useState(3)
  const [guestPickerOpen, setGuestPickerOpen] = useState(false)

  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [paying, setPaying] = useState(false)
  const [tenderedInput, setTenderedInput] = useState('')
  const [actionError, setActionError] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [lastPrintableOrderId, setLastPrintableOrderId] = useState<string | null>(null)

  const locked = currentOrderId !== null

  const loadTables = (attempt = 1) => {
    setTablesLoading(true)
    setTablesLoadError('')
    getTables()
      .then((fetched) => {
        setTables(fetched)
        setSelectedTable((current) => current ?? fetched[0] ?? null)
        setTablesLoading(false)
      })
      .catch((err) => {
        if (attempt < 3) {
          window.setTimeout(() => loadTables(attempt + 1), attempt * 1000)
          return
        }
        setTablesLoading(false)
        setTablesLoadError(err instanceof Error ? err.message : 'Failed to load tables.')
      })
  }

  useEffect(() => {
    getCatalog()
      .then((catalog) => {
        setCategories(catalog.categories)
        setProducts(catalog.items)
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load the menu.'))
      .finally(() => setLoading(false))

    loadTables()

    getCurrencies()
      .then((settings) => {
        const base: ActiveCurrency = { code: settings.baseCode, symbol: settings.baseSymbol, rate: 1 }
        setCurrencies([base, ...settings.supported.map((c) => ({ code: c.code, symbol: c.symbol, rate: c.rate }))])
        setActiveCurrency(base)
      })
      .catch(() => {
        // the currency switcher is a convenience; a failed fetch just leaves POS on its built-in default
      })

    getTaxSettings()
      .then((tax) => {
        setVatRate(tax.vatRatePercent / 100)
        setServiceChargeRate(tax.serviceChargeRatePercent / 100)
      })
      .catch(() => {
        // the live preview just falls back to 0% until this loads; the backend always computes the real charge
      })
      .finally(() => setTaxSettingsLoaded(true))
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

  const round2 = (n: number) => Math.round(n * 100) / 100

  const subtotal = order.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const convertedSubtotal = round2(subtotal * activeCurrency.rate)
  const serviceCharge = round2(convertedSubtotal * serviceChargeRate)
  const tax = round2((convertedSubtotal + serviceCharge) * vatRate)
  const total = convertedSubtotal + serviceCharge + tax
  const amountDue = total
  const tenderedValue = Number(tenderedInput) || 0
  const changeDue = Math.max(0, tenderedValue - amountDue)
  const tenderTooLow = tenderedInput !== '' && tenderedValue < amountDue

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
    setLastPrintableOrderId(null)
    setSending(true)
    try {
      const created = await sendToKitchen(
        serviceMode,
        order.map((line) => ({ menuItemId: line.id, quantity: line.quantity, notes: line.notes })),
        activeCurrency.code
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
    if (tenderTooLow) return
    setActionError('')
    setPaying(true)
    try {
      const completed = currentOrderId
        ? await completeOrder(currentOrderId, method, tenderedValue || amountDue)
        : await createCompletedOrder(
            serviceMode,
            method,
            order.map((line) => ({ menuItemId: line.id, quantity: line.quantity, notes: line.notes })),
            activeCurrency.code,
            tenderedValue || amountDue
          )
      setPaymentOpen(false)
      resetOrder()
      setTenderedInput('')
      setLastPrintableOrderId(completed.id)
      setConfirmation(
        completed.changeDue > 0
          ? `Payment completed (${method}). Change due: ${formatMoney(completed.changeDue, completed.currencySymbol)}.`
          : `Payment completed (${method}).`
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to complete payment.')
    } finally {
      setPaying(false)
    }
  }

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault()
    setNewTableError('')
    setLastPrintableOrderId(null)
    if (!newTableName.trim()) return

    setSavingTable(true)
    try {
      if (editingTableId) {
        const updated = await updateTable(editingTableId, newTableName.trim(), newTableSection, Number(newTableCapacity) || 4)
        setTables((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
        setSelectedTable((prev) => (prev?.id === updated.id ? updated : prev))
        setConfirmation(`Updated ${updated.name}`)
      } else {
        const created = await createTable(newTableName.trim(), newTableSection, Number(newTableCapacity) || 4)
        setTables((prev) => [...prev, created])
        setSelectedTable(created)
        setConfirmation(`Created and selected ${created.name}`)
      }
      setEditingTableId(null)
      setNewTableName('')
      setNewTableFormOpen(false)
      setTableModalOpen(false)
    } catch (err) {
      setNewTableError(err instanceof Error ? err.message : 'Failed to save table.')
    } finally {
      setSavingTable(false)
    }
  }

  const startEditTable = (tbl: RestaurantTable, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingTableId(tbl.id)
    setNewTableName(tbl.name)
    setNewTableSection(tbl.section)
    setNewTableCapacity(tbl.capacity)
    setNewTableError('')
    setNewTableFormOpen(true)
  }

  const cancelTableForm = () => {
    setEditingTableId(null)
    setNewTableName('')
    setNewTableError('')
    setNewTableFormOpen(false)
  }

  const handleArchiveTable = async (tbl: RestaurantTable, e: React.MouseEvent) => {
    e.stopPropagation()
    setLastPrintableOrderId(null)
    try {
      await archiveTable(tbl.id)
      setTables((prev) => prev.filter((t) => t.id !== tbl.id))
      setSelectedTable((prev) => (prev?.id === tbl.id ? null : prev))
      setConfirmation(`Removed ${tbl.name}`)
    } catch (err) {
      setNewTableError(err instanceof Error ? err.message : 'Failed to remove table.')
    }
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

          {currencies.length > 1 && (
            <label className="currency-switcher" title="Currency for this sale">
              <Icon name="cash" size={14} />
              <select
                value={activeCurrency.code}
                disabled={locked}
                onChange={(e) => {
                  const next = currencies.find((c) => c.code === e.target.value)
                  if (next) setActiveCurrency(next)
                }}
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                ))}
              </select>
            </label>
          )}

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
              <span className="product-price">{formatMoney(product.price * activeCurrency.rate, activeCurrency.symbol)}</span>
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
                <h1>{selectedTable?.name ?? 'Select table'}</h1>
                <span className="table-change-badge">Change</span>
              </button>
            ) : (
              <h1>{serviceMode}</h1>
            )}
            {tablesLoadError && (
              <div className="alert error pos-tables-load-error">
                <span>{tablesLoadError}</span>
                <button type="button" className="pill-btn pill-btn-outline sm" onClick={() => loadTables()} disabled={tablesLoading}>
                  {tablesLoading ? 'Retrying…' : 'Retry'}
                </button>
              </div>
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
          {serviceMode === 'Dine in' && selectedTable && <span className="order-context-section">{selectedTable.section}</span>}
        </div>

        <div className="order-lines">
          {confirmation && (
            <div className="alert success pos-confirmation">
              <span>{confirmation}</span>
              {lastPrintableOrderId && (
                <button
                  type="button"
                  className="pos-print-receipt-btn"
                  onClick={() => window.open(`/print/orders/${lastPrintableOrderId}`, '_blank')}
                >
                  <Icon name="receipt" size={13} /> Print receipt
                </button>
              )}
            </div>
          )}
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
                <strong>{formatMoney(line.price * line.quantity * activeCurrency.rate, activeCurrency.symbol)}</strong>
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
            <strong>{formatMoney(convertedSubtotal, activeCurrency.symbol)}</strong>
          </div>
          {serviceCharge > 0 && (
            <div>
              <span>Service charge · {(serviceChargeRate * 100).toFixed(2).replace(/\.?0+$/, '')}%</span>
              <strong>{formatMoney(serviceCharge, activeCurrency.symbol)}</strong>
            </div>
          )}
          <div>
            <span>VAT · {(vatRate * 100).toFixed(2).replace(/\.?0+$/, '')}%</span>
            <strong>{formatMoney(tax, activeCurrency.symbol)}</strong>
          </div>
          <div className="order-total">
            <span>Total</span>
            <strong>{formatMoney(total, activeCurrency.symbol)}</strong>
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
          <button
            className="pay-button"
            disabled={!order.length || !taxSettingsLoaded}
            title={!taxSettingsLoaded ? 'Loading tax settings…' : undefined}
            onClick={() => {
              if (!taxSettingsLoaded) return
              setTenderedInput(amountDue.toFixed(2))
              setPaymentOpen(true)
            }}
          >
            {taxSettingsLoaded ? (
              <>
                Pay <span>{formatMoney(total, activeCurrency.symbol)}</span>
              </>
            ) : (
              'Loading tax settings…'
            )}
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
                  onClick={() => (newTableFormOpen ? cancelTableForm() : setNewTableFormOpen(true))}
                >
                  <Icon name="plus" size={13} />
                  <span>{newTableFormOpen ? 'Close Form' : 'Add Table'}</span>
                </button>
                <button type="button" className="close-btn" onClick={() => setTableModalOpen(false)}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>

            {newTableError && !newTableFormOpen && <div className="alert error table-modal-error">{newTableError}</div>}

            {tablesLoadError && (
              <div className="alert error table-modal-error">
                <span>{tablesLoadError}</span>
                <button type="button" className="pill-btn pill-btn-outline sm" onClick={() => loadTables()} disabled={tablesLoading}>
                  {tablesLoading ? 'Retrying…' : 'Retry'}
                </button>
              </div>
            )}

            {/* Add/Edit Table Form Dropdown Drawer */}
            {newTableFormOpen && (
              <form onSubmit={handleAddTable} className="new-table-drawer">
                <p className="new-table-drawer-title">{editingTableId ? 'Edit table' : 'New table'}</p>
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
                      {TABLE_SECTIONS.map((sec) => <option key={sec} value={sec}>{sec}</option>)}
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

                  <button type="submit" className="pill-btn pill-btn-primary sm" disabled={savingTable} style={{ alignSelf: 'flex-end', height: '38px' }}>
                    {savingTable ? 'Saving…' : editingTableId ? 'Save Changes' : 'Create Table'}
                  </button>
                </div>
                {newTableError && <div className="alert error">{newTableError}</div>}
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
                const isSelected = selectedTable?.id === tbl.id
                return (
                  <div
                    key={tbl.id}
                    role="button"
                    tabIndex={0}
                    className={`pos-table-card ${isSelected ? 'selected' : ''} status-${tbl.status}`}
                    onClick={() => {
                      setSelectedTable(tbl)
                      setTableModalOpen(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedTable(tbl)
                        setTableModalOpen(false)
                      }
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

                    <div className="table-card-actions">
                      <button type="button" title="Edit table" onClick={(e) => startEditTable(tbl, e)}>
                        <Icon name="edit" size={12} />
                      </button>
                      <button type="button" title="Remove table" onClick={(e) => handleArchiveTable(tbl, e)}>
                        <Icon name="trash" size={12} />
                      </button>
                    </div>

                    {isSelected && (
                      <span className="table-selected-check">
                        <Icon name="check" size={12} />
                      </span>
                    )}
                  </div>
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
              <strong>{formatMoney(amountDue, activeCurrency.symbol)}</strong>
            </div>

            <label className="settings-field payment-tendered-field">
              Amount tendered
              <input
                type="number"
                step="0.01"
                min="0"
                value={tenderedInput}
                onChange={(e) => setTenderedInput(e.target.value)}
              />
            </label>

            {tenderTooLow && (
              <div className="alert error">Amount tendered is less than the amount due.</div>
            )}
            {!tenderTooLow && changeDue > 0 && (
              <div className="payment-change-due">
                <span>Change due</span>
                <strong>{formatMoney(changeDue, activeCurrency.symbol)}</strong>
              </div>
            )}

            {actionError && <div className="alert error">{actionError}</div>}

            <div className="payment-methods">
              <button disabled={paying || tenderTooLow} onClick={() => handlePay('Card')}>
                <span className="payment-icon">
                  <Icon name="card" />
                </span>
                <strong>Card</strong>
                <small>Terminal payment</small>
              </button>
              <button disabled={paying || tenderTooLow} onClick={() => handlePay('Cash')}>
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

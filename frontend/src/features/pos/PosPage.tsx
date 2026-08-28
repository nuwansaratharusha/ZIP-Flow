import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Toast'
import { formatMoney } from '../../lib/currency'
import '../../styles/pos.css'
import { getCatalog } from '../menu/api'
import type { Catalog, MenuItem } from '../menu/types'
import { cancelOrder, closeOrder, getOrder, printBill, printRound, sendRound } from '../orders/api'
import type { Order, OrderLineRequest } from '../orders/types'
import { getTaxSettings } from '../settings/api'

type RoundLine = {
  menuItemId: string
  name: string
  price: number
  quantity: number
  notes: string
}

const QUICK_KITCHEN_NOTES = [
  'No Spicy',
  'Less Salt',
  'No Onion/Garlic',
  'Allergy: Nuts',
  'Extra Sauce',
  'Rush Order',
]

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function monogram(name: string) {
  const words = name.trim().split(/\s+/)
  return words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

export function PosPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const tablesBase = location.pathname.startsWith('/waiter') ? '/waiter/tables' : '/tables'

  const [order, setOrder] = useState<Order | null>(null)
  const [catalog, setCatalog] = useState<Catalog>({ categories: [], items: [] })
  const [vatRate, setVatRate] = useState(0)
  const [serviceChargeRate, setServiceChargeRate] = useState(0)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [roundLines, setRoundLines] = useState<RoundLine[]>([])
  const [activeNoteLineId, setActiveNoteLineId] = useState<string | null>(null)
  const [showPreviousRounds, setShowPreviousRounds] = useState(true)

  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState('')

  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  const pendingRoundId = useRef<string | null>(null)

  const loadAll = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    setLoadError('')
    try {
      const [orderData, catalogData, taxData] = await Promise.all([
        getOrder(orderId),
        getCatalog(),
        getTaxSettings(),
      ])
      setOrder(orderData)
      setCatalog(catalogData)
      setVatRate(taxData.vatRatePercent / 100)
      setServiceChargeRate(taxData.serviceChargeRatePercent / 100)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load order.')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return catalog.items.filter((item) => {
      if (item.isArchived || !item.isAvailable) return false
      if (categoryFilter !== 'all' && item.categoryId !== categoryFilter) return false
      if (query && !item.name.toLowerCase().includes(query) && !item.sku.toLowerCase().includes(query)) return false
      return true
    })
  }, [catalog.items, categoryFilter, search])

  const roundSubtotal = useMemo(
    () => round2(roundLines.reduce((sum, line) => sum + round2(line.price * line.quantity), 0)),
    [roundLines],
  )

  const previewSubtotal = round2((order?.subtotal ?? 0) + roundSubtotal)
  const previewServiceCharge = round2(previewSubtotal * serviceChargeRate)
  const previewTax = round2((previewSubtotal + previewServiceCharge) * vatRate)
  const previewTotal = previewSubtotal + previewServiceCharge + previewTax

  function addItem(item: MenuItem) {
    setRoundLines((prev) => {
      const existing = prev.find((line) => line.menuItemId === item.id)
      if (existing) {
        return prev.map((line) =>
          line.menuItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        )
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1, notes: '' }]
    })
  }

  function incrementLine(menuItemId: string) {
    setRoundLines((prev) =>
      prev.map((line) => (line.menuItemId === menuItemId ? { ...line, quantity: line.quantity + 1 } : line)),
    )
  }

  function decrementLine(menuItemId: string) {
    setRoundLines((prev) =>
      prev.map((line) =>
        line.menuItemId === menuItemId ? { ...line, quantity: Math.max(1, line.quantity - 1) } : line,
      ),
    )
  }

  function removeLine(menuItemId: string) {
    setRoundLines((prev) => prev.filter((line) => line.menuItemId !== menuItemId))
  }

  function setLineNotes(menuItemId: string, notes: string) {
    setRoundLines((prev) => prev.map((line) => (line.menuItemId === menuItemId ? { ...line, notes } : line)))
  }

  function appendQuickNote(menuItemId: string, quickNote: string) {
    setRoundLines((prev) =>
      prev.map((line) => {
        if (line.menuItemId !== menuItemId) return line
        const current = line.notes.trim()
        if (current.includes(quickNote)) {
          // Remove if already present
          const next = current
            .replace(new RegExp(`\\b${quickNote}\\b`, 'i'), '')
            .replace(/,\s*,/g, ',')
            .replace(/^,\s*|,\s*$/g, '')
            .trim()
          return { ...line, notes: next }
        }
        const next = current ? `${current}, ${quickNote}` : quickNote
        return { ...line, notes: next }
      }),
    )
  }

  async function handleSendRound() {
    if (!orderId || roundLines.length === 0 || sending) return

    if (!pendingRoundId.current) {
      pendingRoundId.current = crypto.randomUUID()
    }

    setSending(true)
    setSendError('')
    try {
      const lines: OrderLineRequest[] = roundLines.map((line) => ({
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        notes: line.notes.trim() ? line.notes.trim() : undefined,
      }))
      const updated = await sendRound(orderId, lines, pendingRoundId.current)
      const latestRoundNumber = updated.rounds.reduce((max, r) => Math.max(max, r.roundNumber), 0)
      pendingRoundId.current = null
      setOrder(updated)
      setRoundLines([])
      toast.success(`Round #${latestRoundNumber} saved & ticket submitted!`)

      try {
        await printRound(orderId, latestRoundNumber)
        toast.success('Kitchen ticket sent to counter printer.')
      } catch (err) {
        toast.warning('Printer offline, please notify the pass counter.')
      }
    } catch (err) {
      setSendError(
        err instanceof Error
          ? err.message
          : 'Failed to send round. Tap Send round again — it will not duplicate the order.',
      )
      toast.error('Failed to send round. Please retry.')
    } finally {
      setSending(false)
    }
  }

  async function handleClose() {
    if (!orderId || closing || roundLines.length > 0) return
    if (!window.confirm('Close table and generate final bill?')) return

    setClosing(true)
    setCloseError('')
    try {
      const updated = await closeOrder(orderId)
      setOrder(updated)
      toast.success(`Order #${updated.orderNumber} closed. Table is now available.`)

      try {
        await printBill(orderId)
        toast.success('Final bill sent to counter printer.')
      } catch (err) {
        toast.warning('Printer offline, please print bill from browser.')
      }
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Failed to close order.')
      toast.error('Failed to close order.')
    } finally {
      setClosing(false)
    }
  }

  async function handleCancel() {
    if (!orderId || cancelling) return
    const confirmed = window.confirm('Cancel this order and free the table? This cannot be undone.')
    if (!confirmed) return

    setCancelling(true)
    setCancelError('')
    try {
      await cancelOrder(orderId)
      toast.info('Order cancelled. Table freed.')
      navigate(tablesBase)
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Failed to cancel order.')
      toast.error('Failed to cancel order.')
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <main className="content pos-page-loading">
        <div className="loading-container">
          <div className="btn-spinner large" />
          <p className="muted">Loading table order and menu catalog…</p>
        </div>
      </main>
    )
  }

  if (loadError || !order) {
    return (
      <main className="content pos-page-error">
        <div className="alert error">
          <Icon name="alertTriangle" size={16} /> {loadError || 'Order not found.'}
        </div>
        <p style={{ marginTop: 14 }}>
          <Link to={tablesBase} className="secondary-button">
            <Icon name="arrowLeft" size={16} /> Back to Tables Floor Plan
          </Link>
        </p>
      </main>
    )
  }

  // Read-only view for closed/cancelled orders
  if (order.status !== 'Open') {
    return (
      <main className="content pos-readonly-content">
        <div className="pos-readonly-header">
          <div>
            <span className="order-readonly-badge">Order #{order.orderNumber} · {order.status}</span>
            <h1>
              {order.tableName} · {order.customerName}
            </h1>
            <p className="muted">
              This order was finalized on {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
            </p>
          </div>
          <div className="readonly-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => window.open(`/print/orders/${order.id}/bill`, '_blank')}
            >
              <Icon name="receipt" size={16} /> Print Bill
            </button>
            <Link to={tablesBase} className="secondary-button">
              <Icon name="arrowLeft" size={16} /> Back to Tables
            </Link>
          </div>
        </div>

        <div className="section-card posx-readonly-rounds">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Itemized Breakdown</p>
              <h2>Sent Rounds ({order.rounds.length})</h2>
            </div>
          </div>
          {order.rounds.length === 0 && <p className="muted">No rounds were sent on this order.</p>}
          {order.rounds
            .slice()
            .sort((a, b) => a.roundNumber - b.roundNumber)
            .map((round) => (
              <div key={round.id} className="posx-round-block">
                <div className="posx-round-title">
                  <span className="round-badge">
                    <Icon name="utensils" size={13} /> Round {round.roundNumber}
                  </span>
                  <strong className="round-total-val">{formatMoney(round.roundTotal, order.currencySymbol)}</strong>
                </div>
                {round.lines.map((line, index) => (
                  <div className="order-line readonly-line" key={index}>
                    <div className="order-line-main">
                      <span className="line-qty">{line.quantity}×</span>
                      <strong>{line.name}</strong>
                      <span className="line-total">{formatMoney(line.lineTotal, order.currencySymbol)}</span>
                    </div>
                    {line.notes && <div className="line-note-readonly"><Icon name="tag" size={12} /> {line.notes}</div>}
                  </div>
                ))}
              </div>
            ))}
        </div>

        <div className="section-card posx-readonly-totals">
          <div className="order-summary">
            <div>
              <span>Subtotal</span>
              <span>{formatMoney(order.subtotal, order.currencySymbol)}</span>
            </div>
            <div>
              <span>Service charge</span>
              <span>{formatMoney(order.serviceCharge, order.currencySymbol)}</span>
            </div>
            <div>
              <span>VAT / Tax</span>
              <span>{formatMoney(order.tax, order.currencySymbol)}</span>
            </div>
            <div className="order-total">
              <span>Total Bill</span>
              <strong>{formatMoney(order.total, order.currencySymbol)}</strong>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const sortedRounds = order.rounds.slice().sort((a, b) => a.roundNumber - b.roundNumber)

  return (
    <main className="pos-page">
      {/* Left Area: Menu Catalog & Categories */}
      <section className="pos-catalog">
        {/* Header Toolbar */}
        <div className="pos-toolbar">
          <div className="pos-toolbar-left">
            <Link to={tablesBase} className="pos-back-link" title="Return to Tables Floor Plan">
              <Icon name="arrowLeft" size={16} />
              <span>Tables</span>
            </Link>
            <div className="pos-table-badge">
              <span className="table-badge-name">{order.tableName}</span>
              <span className="table-badge-order">#{order.orderNumber}</span>
            </div>
            <h1 className="posx-customer-name">
              <Icon name="user" size={16} /> {order.customerName}
            </h1>
          </div>

          <div className="pos-search">
            <Icon name="search" size={16} />
            <input
              type="text"
              placeholder="Search dishes, drinks, SKU…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button type="button" className="pos-search-clear" onClick={() => setSearch('')}>
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Category Tabs */}
        <div className="category-tabs">
          <button
            type="button"
            className={`cat-tab ${categoryFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            All Items
            <span className="cat-count">
              {catalog.items.filter((i) => !i.isArchived && i.isAvailable).length}
            </span>
          </button>
          {catalog.categories.map((category) => {
            const count = catalog.items.filter(
              (i) => i.categoryId === category.id && !i.isArchived && i.isAvailable,
            ).length
            return (
              <button
                key={category.id}
                type="button"
                className={`cat-tab ${categoryFilter === category.id ? 'active' : ''}`}
                onClick={() => setCategoryFilter(category.id)}
              >
                {category.name}
                <span className="cat-count">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Product Grid */}
        <div className="product-grid">
          {filteredItems.map((item) => {
            const inRound = roundLines.find((l) => l.menuItemId === item.id)
            return (
              <button
                key={item.id}
                type="button"
                className={`product-tile ${inRound ? 'in-current-round' : ''}`}
                onClick={() => addItem(item)}
              >
                <div className="product-top-row">
                  <div className="product-monogram">{monogram(item.name)}</div>
                  {inRound && <span className="in-round-badge">{inRound.quantity} in round</span>}
                </div>
                <div className="product-copy">
                  <strong className="product-name">{item.name}</strong>
                  <small className="product-sku">{item.sku}</small>
                </div>
                <div className="product-bottom-row">
                  <div className="product-price">{formatMoney(item.price, order.currencySymbol)}</div>
                  <span className="product-add-btn">
                    <Icon name="plus" size={14} /> Add
                  </span>
                </div>
              </button>
            )
          })}
          {filteredItems.length === 0 && (
            <div className="pos-empty-catalog">
              <Icon name="utensils" size={32} />
              <p className="muted">No items found matching filter.</p>
            </div>
          )}
        </div>
      </section>

      {/* Right Area: Order Ticket & Round in Progress */}
      <aside className="order-panel">
        <div className="order-header">
          <div>
            <span className="order-eyebrow">Table Service</span>
            <h2 className="order-title">Round #{sortedRounds.length + 1}</h2>
          </div>
          <span className="order-status-chip">
            <span className="live-dot" /> Live Order
          </span>
        </div>

        <div className="order-context">
          <div className="context-item">
            <Icon name="user" size={14} />
            <strong>{order.customerName}</strong>
          </div>
          <div className="context-item">
            <Icon name="grid" size={14} />
            <span>{order.tableName}</span>
          </div>
        </div>

        {/* Order Ticket Content Area */}
        <div className="order-lines posx-order-lines">
          {/* Previous Sent Rounds (Collapsible) */}
          {sortedRounds.length > 0 && (
            <div className="posx-sent-summary">
              <div
                className="posx-sent-header"
                onClick={() => setShowPreviousRounds((prev) => !prev)}
                role="button"
                tabIndex={0}
              >
                <span>
                  <Icon name="checkCircle" size={14} /> Sent to Kitchen ({sortedRounds.length} round{sortedRounds.length === 1 ? '' : 's'})
                </span>
                <span className="posx-sent-total">
                  {formatMoney(order.subtotal, order.currencySymbol)}
                  <Icon name={showPreviousRounds ? 'chevronDown' : 'arrowRight'} size={13} />
                </span>
              </div>

              {showPreviousRounds && (
                <div className="posx-sent-rounds-list">
                  {sortedRounds.map((round) => (
                    <div key={round.id} className="posx-sent-round-card">
                      <div className="posx-sent-round-top">
                        <span className="sent-round-title">Round {round.roundNumber}</span>
                        <span>{formatMoney(round.roundTotal, order.currencySymbol)}</span>
                      </div>
                      <div className="sent-round-items">
                        {round.lines.map((line, idx) => (
                          <div key={idx} className="sent-item-row">
                            <span>{line.quantity}× {line.name}</span>
                            <span className="muted">{formatMoney(line.lineTotal, order.currencySymbol)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Current Round Items */}
          <div className="current-round-header">
            <span className="current-round-label">Current Round In Progress</span>
            <span className="current-round-items-count">
              {roundLines.reduce((sum, l) => sum + l.quantity, 0)} items
            </span>
          </div>

          {roundLines.length === 0 && (
            <div className="empty-order">
              <div className="empty-order-icon">
                <Icon name="pos" size={28} />
              </div>
              <strong>Round is empty</strong>
              <span>Tap menu items on the left to add dishes or drinks to this round.</span>
            </div>
          )}

          {roundLines.map((line) => {
            const isEditingNotes = activeNoteLineId === line.menuItemId
            return (
              <div className="order-line" key={line.menuItemId}>
                <div className="order-line-main">
                  <div className="order-line-title">
                    <strong className="line-item-name">{line.name}</strong>
                    <span className="line-unit-price">@ {formatMoney(line.price, order.currencySymbol)}</span>
                  </div>
                  <strong className="line-total-price">
                    {formatMoney(round2(line.price * line.quantity), order.currencySymbol)}
                  </strong>
                </div>

                <div className="line-actions">
                  <div className="quantity-controls">
                    <button
                      type="button"
                      onClick={() => decrementLine(line.menuItemId)}
                      aria-label="Decrease quantity"
                      className="qty-btn"
                    >
                      <Icon name="minus" size={13} />
                    </button>
                    <span className="qty-val">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => incrementLine(line.menuItemId)}
                      aria-label="Increase quantity"
                      className="qty-btn"
                    >
                      <Icon name="plus" size={13} />
                    </button>
                  </div>

                  <button
                    type="button"
                    className={`note-toggle-btn ${line.notes ? 'has-note' : ''}`}
                    onClick={() =>
                      setActiveNoteLineId(isEditingNotes ? null : line.menuItemId)
                    }
                    title="Add kitchen note"
                  >
                    <Icon name="tag" size={13} />
                    {line.notes ? 'Note added' : 'Add note'}
                  </button>

                  <button
                    type="button"
                    className="line-delete-btn"
                    onClick={() => removeLine(line.menuItemId)}
                    aria-label="Remove line item"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>

                {/* Quick Kitchen Notes Selector */}
                {isEditingNotes && (
                  <div className="quick-notes-panel">
                    <div className="quick-notes-chips">
                      {QUICK_KITCHEN_NOTES.map((note) => {
                        const isSelected = line.notes.includes(note)
                        return (
                          <button
                            type="button"
                            key={note}
                            className={`quick-note-chip ${isSelected ? 'active' : ''}`}
                            onClick={() => appendQuickNote(line.menuItemId, note)}
                          >
                            {isSelected ? '✓ ' : '+ '}
                            {note}
                          </button>
                        )
                      })}
                    </div>
                    <input
                      className="line-note-input"
                      type="text"
                      placeholder="Special instructions (e.g. well done, no cheese)…"
                      value={line.notes}
                      onChange={(event) => setLineNotes(line.menuItemId, event.target.value)}
                      autoFocus
                    />
                  </div>
                )}

                {!isEditingNotes && line.notes && (
                  <div
                    className="line-note-preview"
                    onClick={() => setActiveNoteLineId(line.menuItemId)}
                    role="button"
                    tabIndex={0}
                  >
                    <Icon name="tag" size={11} /> {line.notes}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Error Alerts */}
        {sendError && (
          <div className="alert error posx-inline-alert">
            <Icon name="alertTriangle" size={14} /> {sendError}
          </div>
        )}
        {closeError && (
          <div className="alert error posx-inline-alert">
            <Icon name="alertTriangle" size={14} /> {closeError}
          </div>
        )}
        {cancelError && (
          <div className="alert error posx-inline-alert">
            <Icon name="alertTriangle" size={14} /> {cancelError}
          </div>
        )}

        {/* Warning if un-sent round */}
        {roundLines.length > 0 && (
          <div className="posx-unsent-warning">
            <Icon name="clock" size={14} />
            <span>Unsent round — Send to kitchen before closing the table.</span>
          </div>
        )}

        {/* Financial Summary Breakdown */}
        <div className="order-summary">
          <div>
            <span>Round Subtotal</span>
            <span>{formatMoney(roundSubtotal, order.currencySymbol)}</span>
          </div>
          <div>
            <span>Running Subtotal</span>
            <span>{formatMoney(previewSubtotal, order.currencySymbol)}</span>
          </div>
          {previewServiceCharge > 0 && (
            <div>
              <span>Service Charge ({round2(serviceChargeRate * 100)}%)</span>
              <span>{formatMoney(previewServiceCharge, order.currencySymbol)}</span>
            </div>
          )}
          <div>
            <span>VAT / Tax ({round2(vatRate * 100)}%)</span>
            <span>{formatMoney(previewTax, order.currencySymbol)}</span>
          </div>
          <div className="order-total">
            <span>Grand Total</span>
            <strong>{formatMoney(previewTotal, order.currencySymbol)}</strong>
          </div>
        </div>

        {/* Order Action Buttons */}
        <div className="order-actions">
          <button
            className="primary-button posx-send-button"
            disabled={roundLines.length === 0 || sending}
            onClick={handleSendRound}
          >
            {sending ? (
              <>
                <span className="btn-spinner" /> Sending to kitchen…
              </>
            ) : (
              <>
                <Icon name="utensils" size={16} /> Send Round #{sortedRounds.length + 1}
              </>
            )}
          </button>
          <button
            className="secondary-button posx-close-button"
            disabled={closing || roundLines.length > 0}
            onClick={handleClose}
            title={roundLines.length > 0 ? 'Send current round first' : 'Close table and generate bill'}
          >
            {closing ? (
              <>
                <span className="btn-spinner" /> Closing…
              </>
            ) : (
              <>
                <Icon name="receipt" size={16} /> Close &amp; Bill
              </>
            )}
          </button>
        </div>

        <button
          type="button"
          className="posx-cancel-link"
          disabled={cancelling}
          onClick={handleCancel}
        >
          <Icon name="trash" size={13} /> {cancelling ? 'Cancelling…' : 'Void / Cancel Order'}
        </button>
      </aside>
    </main>
  )
}

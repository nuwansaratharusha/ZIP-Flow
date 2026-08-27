import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
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
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState('')

  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  const [printNotice, setPrintNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Client-generated id for the in-flight "send round" call. Generated once
  // when the waiter first taps Send round, held across any retry so a
  // dropped-connection retry carries the SAME id (the server's double-send
  // guard), and cleared only once that id's send has been confirmed to
  // succeed.
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
      if (query && !item.name.toLowerCase().includes(query)) return false
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

  async function handleSendRound() {
    if (!orderId || roundLines.length === 0 || sending) return

    if (!pendingRoundId.current) {
      pendingRoundId.current = crypto.randomUUID()
    }

    setSending(true)
    setSendError('')
    setPrintNotice(null)
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

      try {
        await printRound(orderId, latestRoundNumber)
        setPrintNotice({ type: 'success', message: 'Sent to counter' })
      } catch (err) {
        setPrintNotice({
          type: 'error',
          message: err instanceof Error ? err.message : 'Printer offline, tell the counter',
        })
      }
    } catch (err) {
      setSendError(
        err instanceof Error
          ? err.message
          : 'Failed to send round. Tap Send round again — it will not duplicate the order.',
      )
    } finally {
      setSending(false)
    }
  }

  async function handleClose() {
    if (!orderId || closing || roundLines.length > 0) return
    setClosing(true)
    setCloseError('')
    setPrintNotice(null)
    try {
      const updated = await closeOrder(orderId)
      setOrder(updated)

      try {
        await printBill(orderId)
        setPrintNotice({ type: 'success', message: 'Sent to counter' })
      } catch (err) {
        setPrintNotice({
          type: 'error',
          message: err instanceof Error ? err.message : 'Printer offline, tell the counter',
        })
      }
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Failed to close order.')
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
      navigate(tablesBase)
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Failed to cancel order.')
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <main className="content">
        <p className="muted">Loading order…</p>
      </main>
    )
  }

  if (loadError || !order) {
    return (
      <main className="content">
        <div className="alert error">{loadError || 'Order not found.'}</div>
        <p style={{ marginTop: 14 }}>
          <Link to={tablesBase} className="secondary-button">
            <Icon name="arrowLeft" /> Back to tables
          </Link>
        </p>
      </main>
    )
  }

  if (order.status !== 'Open') {
    return (
      <main className="content">
        <p className="eyebrow">Order #{order.orderNumber}</p>
        <h1>{order.tableName} · {order.customerName}</h1>
        <p className="muted posx-status-line">
          This order is <strong>{order.status}</strong> and can no longer be changed.
        </p>

        {printNotice && (
          <div className={`alert ${printNotice.type === 'success' ? 'success' : 'error'}`}>{printNotice.message}</div>
        )}

        <div className="section-card posx-readonly-rounds">
          <div className="section-heading">
            <h2>Rounds</h2>
          </div>
          {order.rounds.length === 0 && <p className="muted">No rounds were sent.</p>}
          {order.rounds
            .slice()
            .sort((a, b) => a.roundNumber - b.roundNumber)
            .map((round) => (
              <div key={round.id} className="posx-round-block">
                <div className="posx-round-title">
                  <strong>Round {round.roundNumber}</strong>
                  <span className="muted">{formatMoney(round.roundTotal, order.currencySymbol)}</span>
                </div>
                {round.lines.map((line, index) => (
                  <div className="order-line" key={index}>
                    <div className="order-line-main">
                      <span className="line-qty">{line.quantity}×</span>
                      <strong>{line.name}</strong>
                      <span>{formatMoney(line.lineTotal, order.currencySymbol)}</span>
                    </div>
                    {line.notes && <div className="line-note-readonly">{line.notes}</div>}
                  </div>
                ))}
              </div>
            ))}
        </div>

        <div className="section-card posx-readonly-totals">
          <div className="order-summary">
            <div><span>Subtotal</span><span>{formatMoney(order.subtotal, order.currencySymbol)}</span></div>
            <div><span>Service charge</span><span>{formatMoney(order.serviceCharge, order.currencySymbol)}</span></div>
            <div><span>Tax</span><span>{formatMoney(order.tax, order.currencySymbol)}</span></div>
            <div className="order-total"><span>Total</span><strong>{formatMoney(order.total, order.currencySymbol)}</strong></div>
          </div>
        </div>

        <p style={{ marginTop: 14 }}>
          <Link to={tablesBase} className="secondary-button">
            <Icon name="arrowLeft" /> Back to tables
          </Link>
        </p>
      </main>
    )
  }

  const sortedRounds = order.rounds.slice().sort((a, b) => a.roundNumber - b.roundNumber)

  return (
    <main className="pos-page">
      <section className="pos-catalog">
        <div className="pos-toolbar">
          <div>
            <p className="eyebrow">Order #{order.orderNumber} · {order.tableName}</p>
            <h1 className="posx-customer-name">{order.customerName}</h1>
          </div>
          <div className="pos-search">
            <Icon name="search" />
            <input
              type="text"
              placeholder="Search menu"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="category-tabs">
          <button className={categoryFilter === 'all' ? 'active' : ''} onClick={() => setCategoryFilter('all')}>
            All
          </button>
          {catalog.categories.map((category) => (
            <button
              key={category.id}
              className={categoryFilter === category.id ? 'active' : ''}
              onClick={() => setCategoryFilter(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>

        <div className="product-grid">
          {filteredItems.map((item) => (
            <button key={item.id} className="product-tile" onClick={() => addItem(item)}>
              <div className="product-monogram">{monogram(item.name)}</div>
              <div className="product-copy">
                <strong>{item.name}</strong>
                <small>{item.sku}</small>
              </div>
              <div className="product-price">{formatMoney(item.price, order.currencySymbol)}</div>
              <span className="product-add">
                <Icon name="plus" />
              </span>
            </button>
          ))}
          {filteredItems.length === 0 && <p className="muted">No menu items match.</p>}
        </div>
      </section>

      <aside className="order-panel">
        <div className="order-header">
          <h1>Round in progress</h1>
          <span className="order-meta">
            <Icon name="clock" /> Round {sortedRounds.length + 1}
          </span>
        </div>
        <div className="order-context">
          <span>{order.customerName}</span>
          {order.guestCount != null && <span>{order.guestCount} guests</span>}
        </div>

        <div className="order-lines posx-order-lines">
          {sortedRounds.length > 0 && (
            <div className="posx-sent-summary">
              {sortedRounds.map((round) => (
                <div key={round.id} className="posx-sent-round-row">
                  <span>Round {round.roundNumber} · {round.lines.length} item{round.lines.length === 1 ? '' : 's'}</span>
                  <span>{formatMoney(round.roundTotal, order.currencySymbol)}</span>
                </div>
              ))}
            </div>
          )}

          {roundLines.length === 0 && (
            <div className="empty-order">
              <div className="empty-order-icon">
                <Icon name="pos" />
              </div>
              <strong>No items yet</strong>
              <span>Tap a menu item to add it to this round.</span>
            </div>
          )}

          {roundLines.map((line) => (
            <div className="order-line" key={line.menuItemId}>
              <div className="order-line-main">
                <span className="line-qty">{line.quantity}×</span>
                <strong>{line.name}</strong>
                <span>{formatMoney(round2(line.price * line.quantity), order.currencySymbol)}</span>
              </div>
              <div className="line-actions">
                <button onClick={() => decrementLine(line.menuItemId)} aria-label="Decrease quantity">
                  <Icon name="minus" />
                </button>
                <span>{line.quantity}</span>
                <button onClick={() => incrementLine(line.menuItemId)} aria-label="Increase quantity">
                  <Icon name="plus" />
                </button>
                <button className="line-delete" onClick={() => removeLine(line.menuItemId)} aria-label="Remove line">
                  <Icon name="trash" />
                </button>
              </div>
              <input
                className="line-note-input"
                type="text"
                placeholder="Note (no salt, extra spicy…)"
                value={line.notes}
                onChange={(event) => setLineNotes(line.menuItemId, event.target.value)}
              />
            </div>
          ))}
        </div>

        {sendError && <div className="alert error posx-inline-alert">{sendError}</div>}
        {closeError && <div className="alert error posx-inline-alert">{closeError}</div>}
        {cancelError && <div className="alert error posx-inline-alert">{cancelError}</div>}
        {printNotice && (
          <div className={`alert ${printNotice.type === 'success' ? 'success' : 'error'}`}>{printNotice.message}</div>
        )}
        {roundLines.length > 0 && (
          <div className="posx-unsent-warning">
            <Icon name="clock" /> Unsent round — send it before closing, or these items will be lost.
          </div>
        )}

        <div className="order-summary">
          <div><span>Subtotal</span><span>{formatMoney(previewSubtotal, order.currencySymbol)}</span></div>
          <div><span>Service charge</span><span>{formatMoney(previewServiceCharge, order.currencySymbol)}</span></div>
          <div><span>Tax</span><span>{formatMoney(previewTax, order.currencySymbol)}</span></div>
          <div className="order-total"><span>Total</span><strong>{formatMoney(previewTotal, order.currencySymbol)}</strong></div>
        </div>

        <div className="order-actions">
          <button className="primary-button posx-send-button" disabled={roundLines.length === 0 || sending} onClick={handleSendRound}>
            {sending ? 'Sending…' : 'Send round'}
          </button>
          <button
            className="secondary-button posx-close-button"
            disabled={closing || roundLines.length > 0}
            onClick={handleClose}
            title={roundLines.length > 0 ? 'Send the round in progress first' : undefined}
          >
            {closing ? 'Closing…' : 'Close & print bill'}
          </button>
        </div>

        <button className="posx-cancel-link" disabled={cancelling} onClick={handleCancel}>
          {cancelling ? 'Cancelling…' : 'Cancel order'}
        </button>
      </aside>
    </main>
  )
}

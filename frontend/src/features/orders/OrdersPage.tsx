import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Toast'
import { formatMoney } from '../../lib/currency'
import { getOrder, getOrders, printBill } from './api'
import { ORDER_STATUSES, type Order } from './types'

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
  day: '2-digit',
})

export function OrdersPage() {
  const toast = useToast()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [selected, setSelected] = useState<Order | null>(null)
  const [printingEscPos, setPrintingEscPos] = useState(false)

  const refetch = () => getOrders({ search, status }).then(setOrders)

  useEffect(() => {
    refetch()
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load orders.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (loading) return
    refetch().catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load orders.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status])

  const openDetail = async (order: Order) => {
    setSelected(order)
    try {
      const fresh = await getOrder(order.id)
      setSelected(fresh)
    } catch {
      // keep current data if refresh fails
    }
  }

  const handlePrintEscPos = async (orderId: string) => {
    setPrintingEscPos(true)
    try {
      await printBill(orderId)
      toast.success('Bill sent to counter printer.')
    } catch (err) {
      toast.warning('Counter printer offline. Please reprint using browser.')
    } finally {
      setPrintingEscPos(false)
    }
  }

  const handleCopyOrderNum = (num: number) => {
    navigator.clipboard?.writeText(String(num))
    toast.info(`Order #${num} copied to clipboard.`)
  }

  // Summary Metrics
  const totalVolume = useMemo(
    () => orders.reduce((sum, o) => (o.status === 'Closed' ? sum + o.total : sum), 0),
    [orders],
  )
  const openCount = useMemo(() => orders.filter((o) => o.status === 'Open').length, [orders])
  const closedCount = useMemo(() => orders.filter((o) => o.status === 'Closed').length, [orders])
  const currencySymbol = orders[0]?.currencySymbol ?? '£'

  if (loading) {
    return (
      <main className="content orders-content">
        <div className="loading-container">
          <div className="btn-spinner large" />
          <p className="muted">Loading order transactions…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="content orders-content">
      {/* Hero Header */}
      <div className="dashboard-hero orders-hero">
        <div>
          <p className="eyebrow">Service History</p>
          <h1>Orders &amp; Receipts</h1>
          <p className="muted">Track every table order, reprint bills, and review itemized round tickets.</p>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="orders-metrics-strip">
        <div className="orders-metric-card">
          <span className="metric-label">Total Orders</span>
          <strong>{orders.length}</strong>
        </div>
        <div className="orders-metric-card">
          <span className="metric-label">Active / In-Flight</span>
          <strong className="text-warning">{openCount}</strong>
        </div>
        <div className="orders-metric-card">
          <span className="metric-label">Completed Bills</span>
          <strong className="text-success">{closedCount}</strong>
        </div>
        <div className="orders-metric-card">
          <span className="metric-label">Settled Volume</span>
          <strong className="text-accent">{formatMoney(totalVolume, currencySymbol)}</strong>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="orders-toolbar-container">
        <div className="orders-status-pills">
          <button
            type="button"
            className={`filter-pill ${status === 'All' ? 'active' : ''}`}
            onClick={() => setStatus('All')}
          >
            All <span className="pill-count">{orders.length}</span>
          </button>
          {ORDER_STATUSES.map((s) => {
            const count = orders.filter((o) => o.status === s).length
            return (
              <button
                key={s}
                type="button"
                className={`filter-pill ${status === s ? 'active' : ''}`}
                onClick={() => setStatus(s)}
              >
                {s} <span className="pill-count">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="orders-search-wrapper">
          <Icon name="search" size={16} />
          <input
            placeholder="Search by order #, customer, table or item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="search-clear-btn" onClick={() => setSearch('')}>
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="alert error">
          <Icon name="alertTriangle" size={16} /> {loadError}
        </div>
      )}

      {!loadError && orders.length === 0 && (
        <div className="section-card empty-orders-card">
          <Icon name="orders" size={36} />
          <h3>No orders found</h3>
          <p className="muted">
            {search || status !== 'All'
              ? 'No orders match your filter criteria.'
              : 'No orders recorded yet. Open a table on the Floor Plan to start service.'}
          </p>
          <Link to="/tables" className="primary-button sm" style={{ marginTop: 12 }}>
            <Icon name="grid" size={14} /> Open Floor Plan
          </Link>
        </div>
      )}

      {orders.length > 0 && (
        <section className="section-card orders-table-card">
          <div className="menu-table orders-table">
            <div className="menu-row menu-row-head orders-row">
              <span>Order #</span>
              <span>Time</span>
              <span>Table</span>
              <span>Customer</span>
              <span>Rounds &amp; Items</span>
              <span>Total Bill</span>
              <span>Status</span>
              <span className="actions-col">Action</span>
            </div>
            {orders.map((order) => {
              const allLines = order.rounds.flatMap((r) => r.lines)
              const summaryText =
                allLines.length > 0
                  ? allLines.slice(0, 3).map((l) => `${l.quantity}× ${l.name}`).join(', ') +
                    (allLines.length > 3 ? ` +${allLines.length - 3} more` : '')
                  : 'Empty order'

              return (
                <div
                  className="menu-row orders-row orders-row-clickable"
                  key={order.id}
                  onClick={() => openDetail(order)}
                >
                  <span className="order-num-col">
                    <strong className="order-num-text">#{order.orderNumber}</strong>
                  </span>
                  <span className="muted orders-time-col">
                    <Icon name="clock" size={13} /> {timeFormat.format(new Date(order.createdAt))}
                  </span>
                  <span className="order-table-col">
                    <strong>{order.tableName}</strong>
                  </span>
                  <span className="order-customer-col">{order.customerName}</span>
                  <span className="muted order-items-summary" title={allLines.map((l) => `${l.quantity}× ${l.name}`).join(', ')}>
                    {summaryText}
                  </span>
                  <span className="order-total-col">
                    <strong>{formatMoney(order.total, order.currencySymbol)}</strong>
                  </span>
                  <span>
                    <span className={`order-status-badge ${order.status.toLowerCase()}`}>
                      <span className="status-indicator-dot" />
                      {order.status}
                    </span>
                  </span>
                  <span className="orders-action-col">
                    <button
                      type="button"
                      className="table-detail-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        openDetail(order)
                      }}
                      title="View Bill Details"
                    >
                      <Icon name="receipt" size={14} /> Details
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Slide-Over Order Detail Sheet */}
      {selected && (
        <div className="sheet-backdrop" onMouseDown={() => setSelected(null)}>
          <section className="payment-sheet order-detail-sheet" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-header">
              <div className="sheet-title-group">
                <div className="sheet-order-badge">
                  <span className="sheet-order-number">Order #{selected.orderNumber}</span>
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => handleCopyOrderNum(selected.orderNumber)}
                    title="Copy order number"
                  >
                    <Icon name="copy" size={12} />
                  </button>
                </div>
                <h2>{selected.tableName}</h2>
              </div>
              <div className="sheet-header-actions">
                <button
                  className="icon-button"
                  onClick={() => setSelected(null)}
                  aria-label="Close detail sheet"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            </div>

            {/* Guest & Status Header */}
            <div className="sheet-guest-banner">
              <div className="guest-banner-left">
                <Icon name="user" size={16} />
                <div>
                  <strong>{selected.customerName}</strong>
                  {selected.customerPhone && <span className="customer-phone">{selected.customerPhone}</span>}
                </div>
              </div>
              <span className={`order-status-badge ${selected.status.toLowerCase()}`}>
                {selected.status}
              </span>
            </div>

            <p className="muted order-detail-time">
              Opened on {timeFormat.format(new Date(selected.createdAt))}
            </p>

            {/* Itemized Rounds List */}
            <div className="order-detail-lines">
              {selected.rounds.length === 0 && (
                <p className="muted" style={{ padding: '16px 0' }}>
                  No items were sent on this order.
                </p>
              )}
              {selected.rounds.map((round) => (
                <div key={round.id} className="sheet-round-card">
                  <div className="sheet-round-header">
                    <span className="sheet-round-title">
                      <Icon name="utensils" size={13} /> Round {round.roundNumber}
                    </span>
                    <strong className="sheet-round-total">
                      {formatMoney(round.roundTotal, selected.currencySymbol)}
                    </strong>
                  </div>
                  {round.lines.map((line, index) => (
                    <div className="order-detail-line" key={index}>
                      <div className="order-line-desc">
                        <span className="detail-line-qty">{line.quantity}×</span>
                        <span className="detail-line-name">{line.name}</span>
                        {line.notes && <span className="detail-line-note"><Icon name="tag" size={11} /> {line.notes}</span>}
                      </div>
                      <span className="detail-line-price">
                        {formatMoney(line.lineTotal, selected.currencySymbol)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Summary Totals */}
            <div className="order-summary order-detail-summary">
              <div>
                <span>Subtotal</span>
                <strong>{formatMoney(selected.subtotal, selected.currencySymbol)}</strong>
              </div>
              {selected.serviceCharge > 0 && (
                <div>
                  <span>Service charge</span>
                  <strong>{formatMoney(selected.serviceCharge, selected.currencySymbol)}</strong>
                </div>
              )}
              <div>
                <span>VAT / Tax</span>
                <strong>{formatMoney(selected.tax, selected.currencySymbol)}</strong>
              </div>
              <div className="order-total">
                <span>Grand Total</span>
                <strong>{formatMoney(selected.total, selected.currencySymbol)}</strong>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="sheet-action-footer">
              {selected.status === 'Open' ? (
                <Link to={`/pos/${selected.id}`} className="primary-button full-width">
                  <Icon name="pos" size={16} /> Resume POS Service
                </Link>
              ) : (
                <div className="sheet-print-buttons">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => window.open(`/print/orders/${selected.id}/bill`, '_blank')}
                  >
                    <Icon name="receipt" size={15} /> Print Bill (Browser)
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={printingEscPos}
                    onClick={() => handlePrintEscPos(selected.id)}
                  >
                    <Icon name="printer" size={15} /> {printingEscPos ? 'Printing…' : 'Send to Printer'}
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

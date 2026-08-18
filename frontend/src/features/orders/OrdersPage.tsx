import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { getOrder, getOrders, setOrderStatus } from './api'
import { ORDER_STATUSES, type Order, type OrderStatus } from './types'

const currency = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 0,
})

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: '2-digit' })

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')

  const [selected, setSelected] = useState<Order | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)

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
      // keep the row's data if the detail fetch fails
    }
  }

  const changeStatus = async (next: OrderStatus) => {
    if (!selected) return
    setStatusSaving(true)
    try {
      const updated = await setOrderStatus(selected.id, next)
      setSelected(updated)
      await refetch()
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to update status.')
    } finally {
      setStatusSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="content orders-content">
        <p className="muted">Loading orders…</p>
      </main>
    )
  }

  return (
    <main className="content orders-content">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Transactions</p>
          <h1>Orders</h1>
          <p className="muted">Every order sent to the kitchen or completed at the counter.</p>
        </div>
      </div>

      <div className="orders-toolbar">
        <input
          placeholder="Search by order # or item"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="All">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loadError && <div className="alert error">{loadError}</div>}

      {!loadError && orders.length === 0 && (
        <div className="section-card">
          <p className="muted menu-empty">No orders match. Send an order to the kitchen or complete a payment from POS.</p>
        </div>
      )}

      {orders.length > 0 && (
        <div className="section-card">
          <div className="menu-table orders-table">
            <div className="menu-row menu-row-head orders-row">
              <span>Order #</span>
              <span>Time</span>
              <span>Service</span>
              <span>Items</span>
              <span>Payment</span>
              <span>Total</span>
              <span>Status</span>
            </div>
            {orders.map((order) => (
              <button className="menu-row orders-row orders-row-button" key={order.id} onClick={() => openDetail(order)}>
                <span className="menu-item-name">#{order.orderNumber}</span>
                <span className="muted">{timeFormat.format(new Date(order.createdAt))}</span>
                <span>{order.serviceMode}</span>
                <span className="muted">{order.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ')}</span>
                <span className="muted">{order.paymentMethod ?? '—'}</span>
                <span className="menu-item-name">{currency.format(order.total)}</span>
                <span><span className={`order-status-badge ${order.status.toLowerCase()}`}>{order.status}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="sheet-backdrop" onMouseDown={() => setSelected(null)}>
          <section className="payment-sheet order-detail-sheet" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-header">
              <div>
                <span className="overline">Order #{selected.orderNumber}</span>
                <h2>{selected.serviceMode}</h2>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)}><Icon name="close" /></button>
            </div>

            <p className="muted order-detail-time">{timeFormat.format(new Date(selected.createdAt))}</p>

            <div className="order-detail-lines">
              {selected.lines.map((line, index) => (
                <div className="order-detail-line" key={index}>
                  <span>{line.quantity}× {line.name}</span>
                  <span>{currency.format(line.lineTotal)}</span>
                </div>
              ))}
            </div>

            <div className="order-summary order-detail-summary">
              <div><span>Subtotal</span><strong>{currency.format(selected.subtotal)}</strong></div>
              <div><span>Tax</span><strong>{currency.format(selected.tax)}</strong></div>
              <div className="order-total"><span>Total</span><strong>{currency.format(selected.total)}</strong></div>
            </div>

            <label className="order-detail-status-label">
              Status
              <select
                value={selected.status}
                disabled={statusSaving}
                onChange={(e) => changeStatus(e.target.value as OrderStatus)}
              >
                {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </section>
        </div>
      )}
    </main>
  )
}

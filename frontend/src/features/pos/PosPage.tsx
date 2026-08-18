import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { getCatalog } from '../menu/api'
import type { Category, MenuItem } from '../menu/types'
import { completeOrder, createCompletedOrder, sendToKitchen } from '../orders/api'

type OrderLine = MenuItem & { quantity: number }

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

  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [paying, setPaying] = useState(false)
  const [actionError, setActionError] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const locked = currentOrderId !== null

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

  const subtotal = order.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const tax = Math.round(subtotal * 0.1)
  const total = subtotal + tax

  const addProduct = (product: MenuItem) => {
    if (locked) return
    setOrder((current) => {
      const existing = current.find((line) => line.id === product.id)
      if (existing) {
        return current.map((line) => line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
      }
      return [...current, { ...product, quantity: 1 }]
    })
  }

  const changeQuantity = (id: string, delta: number) => {
    if (locked) return
    setOrder((current) => current
      .map((line) => line.id === id ? { ...line, quantity: line.quantity + delta } : line)
      .filter((line) => line.quantity > 0))
  }

  const removeLine = (id: string) => {
    if (locked) return
    setOrder((current) => current.filter((item) => item.id !== id))
  }

  const resetOrder = () => {
    setOrder([])
    setCurrentOrderId(null)
  }

  const handleSendToKitchen = async () => {
    setActionError('')
    setSending(true)
    try {
      const created = await sendToKitchen(serviceMode, order.map((line) => ({ menuItemId: line.id, quantity: line.quantity })))
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
        await createCompletedOrder(serviceMode, method, order.map((line) => ({ menuItemId: line.id, quantity: line.quantity })))
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
          <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>All</button>
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
              <span className="product-add"><Icon name="plus" /></span>
            </button>
          ))}
        </div>
      </section>

      <aside className="order-panel">
        <div className="order-header">
          <div>
            <span className="overline">Current order</span>
            <h1>{serviceMode === 'Dine in' ? 'Table 12' : serviceMode}</h1>
          </div>
          {locked
            ? <span className="quiet-pill order-sent-pill">Sent to kitchen</span>
            : <button className="order-meta">3 guests <Icon name="chevronDown" /></button>}
        </div>

        <div className="order-context">
          <span>Order #1048</span>
          <span>Alex Morgan</span>
        </div>

        <div className="order-lines">
          {confirmation && <div className="alert success pos-confirmation">{confirmation}</div>}
          {actionError && <div className="alert error pos-confirmation">{actionError}</div>}

          {order.length === 0 && (
            <div className="empty-order">
              <div className="empty-order-icon"><Icon name="receipt" /></div>
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
                <button onClick={() => changeQuantity(line.id, -1)} disabled={locked} aria-label={`Remove one ${line.name}`}><Icon name="minus" /></button>
                <span>{line.quantity}</span>
                <button onClick={() => changeQuantity(line.id, 1)} disabled={locked} aria-label={`Add one ${line.name}`}><Icon name="plus" /></button>
                <button className="line-delete" onClick={() => removeLine(line.id)} disabled={locked} aria-label={`Delete ${line.name}`}><Icon name="trash" /></button>
              </div>
            </article>
          ))}
        </div>

        <div className="order-summary">
          <div><span>Subtotal</span><strong>{currency.format(subtotal)}</strong></div>
          <div><span>Tax · 10%</span><strong>{currency.format(tax)}</strong></div>
          <div className="order-total"><span>Total</span><strong>{currency.format(total)}</strong></div>
        </div>

        <div className="order-actions">
          <button className="send-button" disabled={!order.length || locked || sending} onClick={handleSendToKitchen}>
            {locked ? 'Sent to kitchen' : sending ? 'Sending…' : 'Send to kitchen'}
          </button>
          <button className="pay-button" disabled={!order.length} onClick={() => setPaymentOpen(true)}>
            Pay <span>{currency.format(total)}</span>
          </button>
        </div>
      </aside>

      {paymentOpen && (
        <div className="sheet-backdrop" onMouseDown={() => setPaymentOpen(false)}>
          <section className="payment-sheet" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-header">
              <div>
                <span className="overline">Checkout</span>
                <h2>Choose payment method</h2>
              </div>
              <button className="icon-button" onClick={() => setPaymentOpen(false)}><Icon name="close" /></button>
            </div>

            <div className="payment-amount">
              <span>Amount due</span>
              <strong>{currency.format(total)}</strong>
            </div>

            {actionError && <div className="alert error">{actionError}</div>}

            <div className="payment-methods">
              <button disabled={paying} onClick={() => handlePay('Card')}><span className="payment-icon"><Icon name="card" /></span><strong>Card</strong><small>Terminal payment</small></button>
              <button disabled={paying} onClick={() => handlePay('Cash')}><span className="payment-icon"><Icon name="cash" /></span><strong>Cash</strong><small>Cash drawer</small></button>
              <button disabled><span className="payment-icon"><Icon name="split" /></span><strong>Split</strong><small>Split the bill</small></button>
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

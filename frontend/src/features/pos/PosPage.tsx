import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { formatMoney } from '../../lib/currency'
import { getCatalog } from '../menu/api'
import type { Category, MenuItem } from '../menu/types'
import { createOrder } from '../orders/api'
import { getCurrencies, getTaxSettings } from '../settings/api'

type OrderLine = MenuItem & { quantity: number; notes?: string }
type ActiveCurrency = { code: string; symbol: string; rate: number }
type LastOrder = { id: string; orderNumber: number; destinationLabel: string | null; isDineIn: boolean; changeDue: number; currencySymbol: string }

const STANDARD_NOTES = [5, 10, 20, 50, 100]

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
  const [order, setOrder] = useState<OrderLine[]>([])
  const [destinationLabel, setDestinationLabel] = useState('')

  const [currencies, setCurrencies] = useState<ActiveCurrency[]>([])
  const [activeCurrency, setActiveCurrency] = useState<ActiveCurrency | null>(null)
  const [currencyLoading, setCurrencyLoading] = useState(true)
  const [currencyError, setCurrencyError] = useState('')
  const [vatRate, setVatRate] = useState(0)
  const [serviceChargeRate, setServiceChargeRate] = useState(0)
  const [taxSettingsLoaded, setTaxSettingsLoaded] = useState(false)

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentStep, setPaymentStep] = useState<'method' | 'cash'>('method')
  const [tenderedCents, setTenderedCents] = useState(0)
  const [paying, setPaying] = useState(false)
  const [actionError, setActionError] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null)

  // Client-generated id for the in-flight charge call. Kept stable across retries (e.g.
  // after a timeout/dropped connection) so the server can recognize a retry as the same
  // order instead of creating a duplicate.
  const pendingOrderIdRef = useRef<string | null>(null)

  useEffect(() => {
    getCatalog()
      .then((catalog) => {
        setCategories(catalog.categories)
        setProducts(catalog.items)
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load the menu.'))
      .finally(() => setLoading(false))

    getCurrencies()
      .then((settings) => {
        const base: ActiveCurrency = { code: settings.baseCode, symbol: settings.baseSymbol, rate: 1 }
        setCurrencies([base, ...settings.supported.map((c) => ({ code: c.code, symbol: c.symbol, rate: c.rate }))])
        setActiveCurrency(base)
      })
      .catch((err) => {
        // unlike the other convenience settings, currency is required before an order can be
        // priced/submitted correctly, so a failed fetch must keep the POS blocked rather than
        // silently falling back to a hardcoded currency
        setCurrencyError(err instanceof Error ? err.message : 'Failed to load currency settings.')
      })
      .finally(() => setCurrencyLoading(false))

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

  // Round-half-away-from-zero to 2dp, matching backend's
  // Math.Round(x, 2, MidpointRounding.AwayFromZero) (OrderService.cs).
  // JS's Math.round already rounds .5 up toward +Infinity, which is
  // equivalent to AwayFromZero for the non-negative money values used here.
  const round2 = (n: number) => Math.round(n * 100) / 100

  // activeCurrency stays null until the tenant's real base currency has loaded; fall back to a
  // neutral rate/symbol for display math only — order submission is gated on currencyReady below,
  // so these values never reach the backend before the real currency is known.
  const currencyReady = activeCurrency !== null
  const currencyRate = activeCurrency?.rate ?? 1
  const currencySymbol = activeCurrency?.symbol ?? ''

  // Mirror backend per-line rounding: each line's price is converted to the
  // active currency and rounded to 2dp *before* being multiplied by quantity
  // and summed, rather than rounding the whole subtotal once. Rounding the
  // whole subtotal in one shot (as this used to do) can disagree with the
  // backend by a cent on some orders.
  const convertedSubtotal = order.reduce((sum, line) => {
    const convertedPrice = round2(line.price * currencyRate)
    return sum + convertedPrice * line.quantity
  }, 0)
  const serviceCharge = round2(convertedSubtotal * serviceChargeRate)
  const tax = round2((convertedSubtotal + serviceCharge) * vatRate)
  const total = convertedSubtotal + serviceCharge + tax
  const amountDue = total
  const tenderedValue = tenderedCents / 100
  const changeDue = Math.max(0, tenderedValue - amountDue)
  const tenderTooLow = tenderedValue < amountDue

  const quickNotes = useMemo(
    () => STANDARD_NOTES.filter((note) => note > amountDue).slice(0, 2),
    [amountDue]
  )

  const addProduct = (product: MenuItem) => {
    setOrder((current) => {
      const existing = current.find((line) => line.id === product.id)
      if (existing) {
        return current.map((line) => (line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line))
      }
      return [...current, { ...product, quantity: 1 }]
    })
  }

  const changeQuantity = (id: string, delta: number) => {
    setOrder((current) =>
      current
        .map((line) => (line.id === id ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0)
    )
  }

  const removeLine = (id: string) => {
    setOrder((current) => current.filter((item) => item.id !== id))
  }

  const updateNotes = (id: string, notes: string) => {
    setOrder((current) => current.map((line) => (line.id === id ? { ...line, notes } : line)))
  }

  const openPaymentSheet = () => {
    if (!taxSettingsLoaded) return
    setActionError('')
    setPaymentStep('method')
    setTenderedCents(0)
    setPaymentOpen(true)
  }

  const handleKeypadKey = (key: string) => {
    if (key === '⌫') {
      setTenderedCents((cents) => Math.floor(cents / 10))
      return
    }
    setTenderedCents((cents) => {
      const digits = key === '00' ? '00' : key
      const next = Number(`${cents}${digits}`)
      // Cap the keypad entry at a sane amount (100,000 in the active currency's minor unit)
      // so a mistaken run of digits can't produce an absurd tendered value.
      return Number.isFinite(next) && next < 100_000_00 ? next : cents
    })
  }

  const handleCharge = async (method: 'Cash' | 'Card') => {
    if (!activeCurrency) return
    if (method === 'Cash' && tenderTooLow) return
    setActionError('')
    setPaying(true)
    if (!pendingOrderIdRef.current) {
      pendingOrderIdRef.current = crypto.randomUUID()
    }
    try {
      const created = await createOrder(
        serviceMode,
        method,
        order.map((line) => ({ menuItemId: line.id, quantity: line.quantity, notes: line.notes })),
        {
          destinationLabel: serviceMode === 'Dine in' ? destinationLabel.trim() : undefined,
          currencyCode: activeCurrency.code,
          amountTendered: method === 'Cash' ? tenderedValue : undefined,
          id: pendingOrderIdRef.current,
        }
      )
      pendingOrderIdRef.current = null
      setPaymentOpen(false)
      setOrder([])
      setDestinationLabel('')
      setTenderedCents(0)
      setLastOrder({
        id: created.id,
        orderNumber: created.orderNumber,
        destinationLabel: created.destinationLabel,
        isDineIn: created.serviceMode === 'Dine in',
        changeDue: created.changeDue,
        currencySymbol: created.currencySymbol,
      })
      setConfirmation(
        created.changeDue > 0
          ? `Payment completed (${method}). Change due: ${formatMoney(created.changeDue, created.currencySymbol)}.`
          : `Payment completed (${method}).`
      )
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

          {currencyLoading && (
            <span className="quiet-pill pos-currency-loading" title="Loading currency settings">
              Loading currency…
            </span>
          )}

          {currencyError && (
            <span className="alert error pos-currency-error" title={currencyError}>
              Currency unavailable
            </span>
          )}

          {activeCurrency && currencies.length > 1 && (
            <label className="currency-switcher" title="Currency for this sale">
              <Icon name="cash" size={14} />
              <select
                value={activeCurrency.code}
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
            <button className="product-tile" key={product.id} onClick={() => addProduct(product)}>
              <span className="product-monogram">{monogram(product.name)}</span>
              <span className="product-copy">
                <strong>{product.name}</strong>
                <small>{product.sku}</small>
              </span>
              <span className="product-price">{formatMoney(product.price * currencyRate, currencySymbol)}</span>
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
            <h1>{serviceMode}</h1>
          </div>
        </div>

        {serviceMode === 'Dine in' && (
          <div className="marker-field">
            <label htmlFor="marker-number">Marker number</label>
            <input
              id="marker-number"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 12"
              value={destinationLabel}
              onChange={(e) => setDestinationLabel(e.target.value)}
            />
          </div>
        )}

        <div className="order-lines">
          {confirmation && (
            <div className="alert success pos-confirmation">
              <div className="last-order-banner">
                <span>{confirmation}</span>
                {lastOrder && (
                  <strong>
                    Order #{lastOrder.orderNumber}
                    {lastOrder.destinationLabel
                      ? ` · ${lastOrder.isDineIn ? 'Marker' : 'Collection'} ${lastOrder.destinationLabel}`
                      : ''}
                  </strong>
                )}
              </div>
              {lastOrder && (
                <button
                  type="button"
                  className="pos-print-receipt-btn"
                  onClick={() => window.open(`/print/orders/${lastOrder.id}`, '_blank')}
                >
                  <Icon name="receipt" size={13} /> Print receipt
                </button>
              )}
            </div>
          )}
          {actionError && !paymentOpen && <div className="alert error pos-confirmation">{actionError}</div>}

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
            <article className="order-line" key={line.id}>
              <div className="order-line-main">
                <span className="line-qty">{line.quantity}×</span>
                <div>
                  <strong>{line.name}</strong>
                </div>
                <strong>{formatMoney(line.price * line.quantity * currencyRate, currencySymbol)}</strong>
              </div>
              <div className="line-actions">
                <button
                  onClick={() => changeQuantity(line.id, -1)}
                  aria-label={`Remove one ${line.name}`}
                >
                  <Icon name="minus" />
                </button>
                <span>{line.quantity}</span>
                <button
                  onClick={() => changeQuantity(line.id, 1)}
                  aria-label={`Add one ${line.name}`}
                >
                  <Icon name="plus" />
                </button>
                <button
                  className="line-delete"
                  onClick={() => removeLine(line.id)}
                  aria-label={`Delete ${line.name}`}
                >
                  <Icon name="trash" />
                </button>
              </div>
              <input
                className="line-note-input"
                placeholder="Add a note (e.g. no onion)"
                value={line.notes ?? ''}
                onChange={(e) => updateNotes(line.id, e.target.value)}
              />
            </article>
          ))}
        </div>

        <div className="order-summary">
          <div>
            <span>Subtotal</span>
            <strong>{formatMoney(convertedSubtotal, currencySymbol)}</strong>
          </div>
          {serviceCharge > 0 && (
            <div>
              <span>Service charge · {(serviceChargeRate * 100).toFixed(2).replace(/\.?0+$/, '')}%</span>
              <strong>{formatMoney(serviceCharge, currencySymbol)}</strong>
            </div>
          )}
          <div>
            <span>VAT · {(vatRate * 100).toFixed(2).replace(/\.?0+$/, '')}%</span>
            <strong>{formatMoney(tax, currencySymbol)}</strong>
          </div>
          <div className="order-total">
            <span>Total</span>
            <strong>{formatMoney(total, currencySymbol)}</strong>
          </div>
        </div>

        <div className="order-actions">
          <button
            className="charge-button"
            disabled={
              !order.length ||
              !currencyReady ||
              (serviceMode === 'Dine in' && !destinationLabel.trim())
            }
            title={!currencyReady ? 'Waiting for currency settings to load…' : undefined}
            onClick={openPaymentSheet}
          >
            {currencyReady ? (
              <>
                Charge <span>{formatMoney(total, currencySymbol)}</span>
              </>
            ) : (
              'Loading currency…'
            )}
          </button>
        </div>
      </aside>

      {/* Payment Sheet */}
      {paymentOpen && (
        <div className="sheet-backdrop" onMouseDown={() => setPaymentOpen(false)}>
          <section className="payment-sheet" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-header">
              <div>
                <span className="overline">Checkout</span>
                <h2>{paymentStep === 'method' ? 'Choose payment method' : 'Cash payment'}</h2>
              </div>
              <button className="icon-button" onClick={() => setPaymentOpen(false)}>
                <Icon name="close" />
              </button>
            </div>

            <div className="payment-amount">
              <span>Amount due</span>
              <strong>{formatMoney(amountDue, currencySymbol)}</strong>
            </div>

            {actionError && <div className="alert error">{actionError}</div>}

            {paymentStep === 'method' && (
              <div className="payment-methods">
                <button disabled={paying} onClick={() => handleCharge('Card')}>
                  <span className="payment-icon">
                    <Icon name="card" />
                  </span>
                  <strong>Card</strong>
                  <small>Terminal payment</small>
                </button>
                <button
                  disabled={paying}
                  onClick={() => {
                    setTenderedCents(0)
                    setPaymentStep('cash')
                  }}
                >
                  <span className="payment-icon">
                    <Icon name="cash" />
                  </span>
                  <strong>Cash</strong>
                  <small>Cash drawer</small>
                </button>
              </div>
            )}

            {paymentStep === 'cash' && (
              <>
                <button type="button" className="cash-entry-back" onClick={() => setPaymentStep('method')}>
                  <Icon name="arrowLeft" size={12} /> Back
                </button>

                <div className="cash-entry-rows">
                  <div className="cash-entry-row tendered">
                    <span>Tendered</span>
                    <strong>{formatMoney(tenderedValue, currencySymbol)}</strong>
                  </div>
                  <div className="cash-entry-row change">
                    <span>Change</span>
                    <strong>{formatMoney(changeDue, currencySymbol)}</strong>
                  </div>
                </div>

                <div className="quick-tender-row">
                  <button type="button" onClick={() => setTenderedCents(Math.round(amountDue * 100))}>
                    Exact
                  </button>
                  {quickNotes.map((note) => (
                    <button type="button" key={note} onClick={() => setTenderedCents(Math.round(note * 100))}>
                      {formatMoney(note, currencySymbol)}
                    </button>
                  ))}
                </div>

                <div className="keypad-grid">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00', '⌫'].map((key) => (
                    <button type="button" key={key} onClick={() => handleKeypadKey(key)}>
                      {key}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="keypad-charge-button"
                  disabled={paying || tenderTooLow}
                  onClick={() => handleCharge('Cash')}
                >
                  {paying ? 'Charging…' : `Charge ${formatMoney(amountDue, currencySymbol)}`}
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

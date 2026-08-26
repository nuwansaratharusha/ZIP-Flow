import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { formatMoney } from '../../lib/currency'
import { getOrder } from '../orders/api'
import type { Order } from '../orders/types'
import { getReceiptSettings } from '../settings/api'
import type { ReceiptSettings } from '../settings/types'

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const TAKEAWAY_MODES = ['Takeaway', 'Delivery']

export function ReceiptPrintPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const { session } = useAuth()

  const [order, setOrder] = useState<Order | null>(null)
  const [settings, setSettings] = useState<ReceiptSettings | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!orderId) return
    Promise.all([getOrder(orderId), getReceiptSettings()])
      .then(([fetchedOrder, fetchedSettings]) => {
        setOrder(fetchedOrder)
        setSettings(fetchedSettings)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load receipt.'))
  }, [orderId])

  useEffect(() => {
    if (order && settings) {
      const timer = window.setTimeout(() => window.print(), 200)
      return () => window.clearTimeout(timer)
    }
  }, [order, settings])

  if (error) {
    return (
      <main className="receipt-page">
        <p className="alert error">{error}</p>
      </main>
    )
  }

  if (!order || !settings) {
    return (
      <main className="receipt-page">
        <p className="muted">Loading receipt…</p>
      </main>
    )
  }

  const showCollectionCode = settings.showCollectionCode && TAKEAWAY_MODES.includes(order.serviceMode)

  return (
    <main className="receipt-page">
      <div className="receipt-sheet">
        <h1 className="receipt-business-name">{settings.businessName}</h1>
        <p className="receipt-meta-line">{session?.user?.displayName ?? 'Staff'}</p>
        <p className="receipt-meta-line">{dateTimeFormat.format(new Date(order.createdAt))}</p>
        <p className="receipt-meta-line">Order #{order.orderNumber} · {order.serviceMode}</p>

        <div className="receipt-divider" />

        <div className="receipt-lines">
          {order.lines.map((line, index) => (
            <div className="receipt-line" key={index}>
              <div className="receipt-line-row">
                <span>{line.quantity}× {line.name}</span>
                <span>{formatMoney(line.lineTotal, order.currencySymbol)}</span>
              </div>
              {line.notes && <p className="receipt-line-note">{line.notes}</p>}
            </div>
          ))}
        </div>

        <div className="receipt-divider" />

        <div className="receipt-totals">
          <div><span>Subtotal</span><span>{formatMoney(order.subtotal, order.currencySymbol)}</span></div>
          {order.serviceCharge > 0 && (
            <div><span>Service charge</span><span>{formatMoney(order.serviceCharge, order.currencySymbol)}</span></div>
          )}
          <div><span>Tax</span><span>{formatMoney(order.tax, order.currencySymbol)}</span></div>
          <div className="receipt-total-line"><span>Total</span><span>{formatMoney(order.total, order.currencySymbol)}</span></div>
          {order.paymentState === 'Paid' && (
            <>
              <div><span>Tendered</span><span>{formatMoney(order.amountTendered, order.currencySymbol)}</span></div>
              <div><span>Change</span><span>{formatMoney(order.changeDue, order.currencySymbol)}</span></div>
            </>
          )}
        </div>

        <div className="receipt-divider" />

        <p className="receipt-meta-line">Payment: {order.paymentMethod ?? '—'}</p>
        {settings.showTaxId && settings.taxId && <p className="receipt-meta-line">VAT/Tax ID: {settings.taxId}</p>}
        {showCollectionCode && (
          <p className="receipt-collection-code">Collection code: {order.destinationLabel ?? order.orderNumber}</p>
        )}

        <p className="receipt-footer-message">{settings.footerMessage}</p>
        <p className="receipt-powered-by">Powered by ZIP Flow</p>
      </div>
    </main>
  )
}

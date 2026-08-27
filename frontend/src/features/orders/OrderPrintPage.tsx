import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { formatMoney } from '../../lib/currency'
import { getOrder } from './api'
import type { Order, OrderRound } from './types'
import { getReceiptSettings } from '../settings/api'
import type { ReceiptSettings } from '../settings/types'
import '../../styles/print.css'

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function OrderLines({ round, currencySymbol }: { round: OrderRound; currencySymbol: string }) {
  return (
    <div className="receipt-lines">
      {round.lines.map((line, index) => (
        <div className="receipt-line" key={index}>
          <div className="receipt-line-row">
            <span>{line.quantity}× {line.name} @ {formatMoney(line.price, currencySymbol)}</span>
            <span>{formatMoney(line.lineTotal, currencySymbol)}</span>
          </div>
          {line.notes && <p className="receipt-line-note">{line.notes}</p>}
        </div>
      ))}
    </div>
  )
}

export function OrderPrintPage() {
  const { orderId, roundNumber } = useParams<{ orderId: string; roundNumber?: string }>()
  const { session } = useAuth()

  const [order, setOrder] = useState<Order | null>(null)
  const [settings, setSettings] = useState<ReceiptSettings | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!orderId) {
      setError('No order specified.')
      return
    }

    Promise.all([getOrder(orderId), getReceiptSettings()])
      .then(([fetchedOrder, fetchedSettings]) => {
        setOrder(fetchedOrder)
        setSettings(fetchedSettings)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load order.'))
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
        <p className="muted">Loading print…</p>
      </main>
    )
  }

  const requestedRound = roundNumber === undefined ? null : Number(roundNumber)
  const round = requestedRound === null
    ? null
    : order.rounds.find((r) => r.roundNumber === requestedRound) ?? null

  if (requestedRound !== null && !round) {
    return (
      <main className="receipt-page">
        <p className="alert error">Round {requestedRound} was not found on order #{order.orderNumber}.</p>
      </main>
    )
  }

  return (
    <main className="receipt-page">
      <div className="receipt-sheet">
        <h1 className="receipt-business-name">{settings.businessName}</h1>
        <p className="receipt-meta-line">{session?.user?.displayName ?? 'Staff'}</p>
        <p className="receipt-meta-line">{dateTimeFormat.format(new Date(order.createdAt))}</p>
        <p className="receipt-meta-line">Order #{order.orderNumber} · {order.tableName}</p>
        <p className="receipt-meta-line">{order.customerName}</p>

        <div className="receipt-divider" />

        {round ? (
          <>
            <p className="print-round-heading">Round {round.roundNumber}</p>
            <OrderLines round={round} currencySymbol={order.currencySymbol} />

            <div className="receipt-divider" />

            <div className="receipt-totals">
              <div><span>Round total</span><span>{formatMoney(round.roundTotal, order.currencySymbol)}</span></div>
              <div className="receipt-total-line">
                <span>Table running total</span>
                <span>
                  {formatMoney(
                    order.rounds
                      .filter((r) => r.roundNumber <= round.roundNumber)
                      .reduce((sum, r) => sum + r.roundTotal, 0),
                    order.currencySymbol,
                  )}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            {order.rounds.map((r) => (
              <div className="print-bill-round" key={r.id}>
                <p className="print-round-heading">Round {r.roundNumber}</p>
                <OrderLines round={r} currencySymbol={order.currencySymbol} />
                <div className="print-bill-round-total">
                  <span>Round total</span>
                  <span>{formatMoney(r.roundTotal, order.currencySymbol)}</span>
                </div>
                <div className="receipt-divider" />
              </div>
            ))}

            <div className="receipt-totals">
              <div><span>Subtotal</span><span>{formatMoney(order.subtotal, order.currencySymbol)}</span></div>
              {order.serviceCharge > 0 && (
                <div><span>Service charge</span><span>{formatMoney(order.serviceCharge, order.currencySymbol)}</span></div>
              )}
              <div><span>VAT</span><span>{formatMoney(order.tax, order.currencySymbol)}</span></div>
              <div className="receipt-total-line"><span>Total</span><span>{formatMoney(order.total, order.currencySymbol)}</span></div>
            </div>

            <div className="receipt-divider" />

            {settings.showTaxId && settings.taxId && <p className="receipt-meta-line">VAT/Tax ID: {settings.taxId}</p>}
          </>
        )}

        <p className="receipt-footer-message">{settings.footerMessage}</p>
        <p className="receipt-powered-by">Powered by ZIP Flow</p>
      </div>
    </main>
  )
}

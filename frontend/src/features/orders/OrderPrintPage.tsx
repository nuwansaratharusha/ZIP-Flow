import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { formatMoney } from '../../lib/currency'
import { getOrder, printBill, printRound } from './api'
import type { Order, OrderRound } from './types'
import { getPrinterSettings, getReceiptSettings } from '../settings/api'
import type { PrinterSettings, ReceiptSettings } from '../settings/types'
import { Icon } from '../../components/Icon'
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
            <div className="receipt-line-left">
              <span className="receipt-line-qty">{line.quantity}×</span>
              <span className="receipt-line-name">{line.name}</span>
              <span className="receipt-line-unit-price">@ {formatMoney(line.price, currencySymbol)}</span>
            </div>
            <span className="receipt-line-total">{formatMoney(line.lineTotal, currencySymbol)}</span>
          </div>
          {line.notes && <p className="receipt-line-note">↳ {line.notes}</p>}
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
  const [printer, setPrinter] = useState<PrinterSettings | null>(null)
  const [error, setError] = useState('')
  const [sendingEscPos, setSendingEscPos] = useState(false)
  const [escPosMessage, setEscPosMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!orderId) {
      setError('No order specified.')
      return
    }

    Promise.all([getOrder(orderId), getReceiptSettings(), getPrinterSettings()])
      .then(([fetchedOrder, fetchedSettings, fetchedPrinter]) => {
        setOrder(fetchedOrder)
        setSettings(fetchedSettings)
        setPrinter(fetchedPrinter)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load order.'))
  }, [orderId])

  const requestedRound = roundNumber === undefined ? null : Number(roundNumber)
  const round = requestedRound === null
    ? null
    : order?.rounds.find((r) => r.roundNumber === requestedRound) ?? null

  const handleDirectPrint = async () => {
    if (!orderId) return
    setSendingEscPos(true)
    setEscPosMessage(null)
    try {
      if (requestedRound !== null && round) {
        await printRound(orderId, round.roundNumber)
        setEscPosMessage({
          type: 'success',
          text: `Round #${round.roundNumber} ticket sent to Epson POS (${printer?.ipAddress || '192.168.1.117'})!`,
        })
      } else {
        await printBill(orderId)
        setEscPosMessage({
          type: 'success',
          text: `Final bill sent directly to Epson POS (${printer?.ipAddress || '192.168.1.117'})!`,
        })
      }
    } catch (err) {
      setEscPosMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not stream to thermal printer.',
      })
    } finally {
      setSendingEscPos(false)
    }
  }

  if (error) {
    return (
      <main className="receipt-page">
        <div className="alert error">{error}</div>
        <Link to="/orders" className="receipt-back-link" style={{ marginTop: 16 }}>
          <Icon name="arrowLeft" size={14} /> Back to Orders
        </Link>
      </main>
    )
  }

  if (!order || !settings) {
    return (
      <main className="receipt-page">
        <p className="muted">Formatting receipt for thermal printer…</p>
      </main>
    )
  }

  if (requestedRound !== null && !round) {
    return (
      <main className="receipt-page">
        <div className="alert error">
          Round {requestedRound} was not found on order #{order.orderNumber}.
        </div>
        <Link to="/orders" className="receipt-back-link" style={{ marginTop: 16 }}>
          <Icon name="arrowLeft" size={14} /> Back to Orders
        </Link>
      </main>
    )
  }

  const printerTargetDisplay = printer?.ipAddress
    ? `Epson TM-m30II (${printer.ipAddress})`
    : 'Epson TM-m30II (192.168.1.117)'

  return (
    <main className="receipt-page">
      {/* On-screen control bar (Hidden on physical print output) */}
      <div className="receipt-control-bar no-print">
        <div className="receipt-control-bar-top">
          <Link to="/orders" className="receipt-back-link">
            <Icon name="arrowLeft" size={14} /> Return to Orders
          </Link>
          <div className="receipt-printer-target-badge" title="Target POS Thermal Printer">
            <span className="dot" />
            <span>{printerTargetDisplay}</span>
          </div>
        </div>

        <div className="receipt-control-bar-buttons">
          <button
            type="button"
            className="receipt-print-direct-btn"
            disabled={sendingEscPos}
            onClick={handleDirectPrint}
            title="Sends raw ESC/POS commands directly over network to Epson POS printer (avoids photocopy machine)"
          >
            <Icon name="printer" size={15} />
            <span>{sendingEscPos ? 'Printing…' : 'Print to Epson POS'}</span>
          </button>

          <button
            type="button"
            className="receipt-print-browser-btn"
            onClick={() => window.print()}
            title="Trigger standard browser or AirPrint print dialog"
          >
            <Icon name="receipt" size={15} />
            <span>Browser / AirPrint</span>
          </button>
        </div>

        {escPosMessage && (
          <div className={`alert ${escPosMessage.type}`} style={{ margin: 0, padding: '8px 12px', fontSize: 11.5 }}>
            <Icon name={escPosMessage.type === 'success' ? 'check' : 'alertTriangle'} size={14} />
            <span>{escPosMessage.text}</span>
          </div>
        )}
      </div>

      {/* 80mm Physical Thermal Receipt Simulation */}
      <div className="receipt-sheet">
        <div className="receipt-brand-header">
          <h1 className="receipt-business-name">{settings.businessName || session?.tenant.name || 'ZIP Flow Restaurant'}</h1>
          <p className="receipt-doc-title">
            {round ? `Kitchen Pass — Round #${round.roundNumber}` : 'Customer Bill / Receipt'}
          </p>
          <p className="receipt-meta-line">{dateTimeFormat.format(new Date(order.createdAt))}</p>
        </div>

        <hr className="receipt-divider" />

        <div className="receipt-meta-grid">
          <span><strong>Order:</strong> #{order.orderNumber}</span>
          <span><strong>Table:</strong> {order.tableName}</span>
          <span><strong>Server:</strong> {session?.user?.displayName ?? 'Staff'}</span>
          <span><strong>Guest:</strong> {order.customerName}</span>
        </div>

        <hr className="receipt-divider" />

        {round ? (
          <>
            <p className="print-round-heading">Round {round.roundNumber}</p>
            <OrderLines round={round} currencySymbol={order.currencySymbol} />

            <hr className="receipt-divider" />

            <div className="receipt-totals">
              <div>
                <span>Round Total</span>
                <span>{formatMoney(round.roundTotal, order.currencySymbol)}</span>
              </div>
              <div className="receipt-total-line">
                <span>Table Running Total</span>
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
                  <span>Round Total</span>
                  <span>{formatMoney(r.roundTotal, order.currencySymbol)}</span>
                </div>
                <hr className="receipt-divider" />
              </div>
            ))}

            <div className="receipt-totals">
              <div>
                <span>Subtotal</span>
                <span>{formatMoney(order.subtotal, order.currencySymbol)}</span>
              </div>
              {order.serviceCharge > 0 && (
                <div>
                  <span>Service Charge</span>
                  <span>{formatMoney(order.serviceCharge, order.currencySymbol)}</span>
                </div>
              )}
              <div>
                <span>VAT / Tax</span>
                <span>{formatMoney(order.tax, order.currencySymbol)}</span>
              </div>
              <div className="receipt-total-line">
                <span>TOTAL DUE</span>
                <span>{formatMoney(order.total, order.currencySymbol)}</span>
              </div>
            </div>

            <hr className="receipt-divider-double" />

            {settings.showTaxId && settings.taxId && (
              <p className="receipt-tax-id-line">VAT / Tax ID: {settings.taxId}</p>
            )}
          </>
        )}

        <p className="receipt-footer-message">{settings.footerMessage || 'Thank you for your visit!'}</p>
        <p className="receipt-powered-by">Powered by ZIP Flow POS</p>

        <div className="receipt-barcode-box">
          <div className="receipt-barcode-lines" />
          <span className="receipt-barcode-text">ORDER #{order.orderNumber} · {order.tableName}</span>
        </div>
      </div>
    </main>
  )
}

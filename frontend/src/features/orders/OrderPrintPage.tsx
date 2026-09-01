import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getOrder } from './api'
import type { Order, OrderLine } from './types'
import { getPrinterSettings, getReceiptSettings } from '../settings/api'
import type { PrinterSettings, ReceiptSettings } from '../settings/types'
import { Icon } from '../../components/Icon'
import { buildReceiptEposXml, printToEpson } from '../../lib/eposPrint'
import '../../styles/print.css'

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}-${month}-${year}`
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  const secs = String(d.getSeconds()).padStart(2, '0')
  return `${hours}:${mins}:${secs}`
}

function InvoiceItemRow({ line }: { line: OrderLine }) {
  return (
    <div className="invoice-item-block">
      <div className="invoice-item-name">{line.name.toUpperCase()}</div>
      <div className="invoice-item-cols">
        <span className="invoice-col-qty">{line.quantity.toFixed(2)}</span>
        <span className="invoice-col-price">{line.price.toFixed(2)}</span>
        <span className="invoice-col-total">{line.lineTotal.toFixed(2)}</span>
      </div>
      {line.notes && <p className="invoice-item-note">* Note: {line.notes}</p>}
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

  // Print STRAIGHT from this device (iPad) to the Epson on the shop LAN via
  // ePOS-Print — same as Lightspeed. No cloud->printer hop, so it can't pick
  // the photocopier and doesn't depend on the printer polling anything.
  const handleDirectPrint = async () => {
    if (!order || !settings) return
    const ip = printer?.ipAddress
    if (!ip) {
      setEscPosMessage({ type: 'error', text: 'No printer IP set. Add the Epson IP in Settings → Printer.' })
      return
    }
    setSendingEscPos(true)
    setEscPosMessage(null)
    try {
      const xml = buildReceiptEposXml(order, settings, session?.user?.displayName ?? 'Staff', round)
      // ePOS-Print is served on the printer's HTTP port (80), not the raw 9100 socket.
      await printToEpson(ip, xml, 80)
      setEscPosMessage({
        type: 'success',
        text: round
          ? `Round #${round.roundNumber} sent to the Epson (${ip}).`
          : `Bill sent to the Epson (${ip}).`,
      })
    } catch (err) {
      setEscPosMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not reach the printer from this device.',
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

  const orderCode = `G${order.orderNumber.toString().padStart(8, '0')}`
  const dateFormatted = formatDate(order.createdAt)
  const timeFormatted = formatTime(order.createdAt)

  // Calculate items count
  const allLines = requestedRound !== null && round
    ? round.lines
    : order.rounds.flatMap((r) => r.lines)
  const totalItemCount = allLines.reduce((sum, l) => sum + l.quantity, 0)
  const totalAmount = requestedRound !== null && round ? round.roundTotal : order.total

  return (
    <main className="receipt-page">
      {/* On-screen control bar (Hidden during physical browser/AirPrint) */}
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
        {/* Header (Centered Restaurant Branding) */}
        <div className="receipt-brand-header">
          <h1 className="receipt-business-name">
            {settings.businessName || session?.tenant.name || 'RESTAURANT KAMU - GALLE'}
          </h1>
          <p className="receipt-company-subtitle">PREMADASAS LUXURY VILLAS &amp; SPA (PVT) LTD.</p>
          <p className="receipt-address-line">NO: 24, HOSPITAL STREET, GALLE FORT.</p>
          <p className="receipt-address-line">SRI LANKA.</p>
          <p className="receipt-contact-line">TEL : +94 91 2222173 FAX : +94 91 2231973</p>
        </div>

        <hr className="receipt-divider" />

        {/* Document Title */}
        <h2 className="receipt-invoice-title">
          {round ? `KITCHEN PASS - ROUND #${round.roundNumber}` : 'SALES INVOICE'}
        </h2>

        <hr className="receipt-divider" />

        {/* Metadata Line: [Invoice #] [Date] [Time] */}
        <div className="invoice-meta-row">
          <span>{orderCode}</span>
          <span>{dateFormatted}</span>
          <span>{timeFormatted}</span>
        </div>
        <div className="invoice-meta-subrow">
          <span>Table: {order.tableName}</span>
          <span>Server: {session?.user?.displayName ?? 'Staff'}</span>
        </div>

        {/* Items Listing */}
        <div className="invoice-items-list">
          {allLines.map((line, idx) => (
            <InvoiceItemRow key={idx} line={line} />
          ))}
        </div>

        <hr className="receipt-divider" />

        {/* Financial Net Amount */}
        <div className="invoice-net-row">
          <span>NET AMOUNT</span>
          <span>{totalAmount.toFixed(2)}</span>
        </div>

        <div style={{ height: 6 }} />

        {/* Payment Breakdown */}
        <div className="invoice-summary-table">
          <div className="invoice-summary-row">
            <span>CASH</span>
            <span>{totalAmount.toFixed(2)}</span>
          </div>
          <div className="invoice-summary-row">
            <span>CHEQUE</span>
            <span></span>
          </div>
          <div className="invoice-summary-row">
            <span>CREDIT</span>
            <span></span>
          </div>
          <div className="invoice-summary-row">
            <span>OTHER</span>
            <span></span>
          </div>
        </div>

        <hr className="receipt-divider" />

        {/* Tended and Balance */}
        <div className="invoice-summary-table">
          <div className="invoice-summary-row">
            <span>TENDED</span>
            <span>{totalAmount.toFixed(2)}</span>
          </div>
          <div className="invoice-summary-row">
            <span>BALANCE</span>
            <span>0.00</span>
          </div>
        </div>

        <hr className="receipt-divider" />

        {/* Statistics Breakdown */}
        <div className="invoice-summary-table">
          <div className="invoice-summary-row">
            <span>* TOTAL DISCOUNT</span>
            <span>0.00</span>
          </div>
          <div className="invoice-summary-row">
            <span>* NUMBER OF ITEM</span>
            <span>{totalItemCount}</span>
          </div>
        </div>

        <hr className="receipt-divider" />

        <div className="invoice-summary-table">
          <div className="invoice-summary-row">
            <span>TOTAL CREDIT</span>
            <span>0.00</span>
          </div>
        </div>

        <hr className="receipt-divider" />

        {/* Footer Thanks & Software Branding */}
        <p className="invoice-footer-thanks">
          {settings.footerMessage || 'Thanks and Come again!!!!'}
        </p>
        <p className="invoice-software-by">Software By ZIP Flow POS</p>

        <hr className="receipt-divider" />
      </div>
    </main>
  )
}

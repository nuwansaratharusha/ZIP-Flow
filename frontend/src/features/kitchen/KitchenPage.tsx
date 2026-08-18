import { useEffect, useState } from 'react'
import { STATIONS } from '../menu/types'
import { setOrderStatus } from '../orders/api'
import { getTickets } from './api'
import type { Ticket } from './types'

const STAGE_ORDER = ['Sent', 'Preparing', 'Ready'] as const

function nextStage(status: string) {
  const index = STAGE_ORDER.indexOf(status as (typeof STAGE_ORDER)[number])
  return index >= 0 && index < STAGE_ORDER.length - 1 ? STAGE_ORDER[index + 1] : null
}

function previousStage(status: string) {
  const index = STAGE_ORDER.indexOf(status as (typeof STAGE_ORDER)[number])
  return index > 0 ? STAGE_ORDER[index - 1] : null
}

function elapsedLabel(createdAt: string, nowMs: number) {
  const seconds = Math.max(0, Math.floor((nowMs - new Date(createdAt).getTime()) / 1000))
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export function KitchenPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [stationFilter, setStationFilter] = useState('all')
  const [now, setNow] = useState(() => Date.now())
  const [busyId, setBusyId] = useState<string | null>(null)

  const refetch = () => getTickets().then(setTickets)

  useEffect(() => {
    refetch()
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load kitchen tickets.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const poll = window.setInterval(() => {
      refetch().catch(() => {})
    }, 5000)
    return () => window.clearInterval(poll)
  }, [])

  useEffect(() => {
    const ticker = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(ticker)
  }, [])

  const visibleTickets = tickets.filter((ticket) =>
    stationFilter === 'all' || ticket.lines.some((line) => (line.station ?? 'Unassigned') === stationFilter)
  )

  const changeStatus = async (ticket: Ticket, status: string) => {
    setBusyId(ticket.id)
    try {
      await setOrderStatus(ticket.id, status as Ticket['status'])
      await refetch()
    } catch {
      // transient failure — next poll will resync the board
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <main className="content kitchen-content">
        <p className="muted">Loading kitchen tickets…</p>
      </main>
    )
  }

  return (
    <main className="content kitchen-content">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Live board</p>
          <h1>Kitchen Display</h1>
          <p className="muted">Every order currently sent, preparing, or ready — refreshes automatically.</p>
        </div>
      </div>

      {loadError && <div className="alert error">{loadError}</div>}

      <div className="kitchen-station-tabs">
        <button className={stationFilter === 'all' ? 'active' : ''} onClick={() => setStationFilter('all')}>All</button>
        {STATIONS.map((s) => (
          <button key={s} className={stationFilter === s ? 'active' : ''} onClick={() => setStationFilter(s)}>{s}</button>
        ))}
        <button className={stationFilter === 'Unassigned' ? 'active' : ''} onClick={() => setStationFilter('Unassigned')}>Unassigned</button>
      </div>

      {visibleTickets.length === 0 && (
        <div className="section-card">
          <p className="muted menu-empty">No active tickets. Send an order to the kitchen from POS.</p>
        </div>
      )}

      <div className="kitchen-ticket-grid">
        {visibleTickets.map((ticket) => (
          <article className="kitchen-ticket" key={ticket.id}>
            <div className="kitchen-ticket-header">
              <div>
                <span className="overline">Order #{ticket.orderNumber}</span>
                <strong>{ticket.serviceMode}</strong>
              </div>
              <span className={`order-status-badge ${ticket.status.toLowerCase()}`}>{ticket.status}</span>
            </div>

            <div className="kitchen-ticket-timer">{elapsedLabel(ticket.createdAt, now)}</div>

            <div className="kitchen-ticket-lines">
              {ticket.lines.map((line, index) => (
                <div className="kitchen-ticket-line" key={index}>
                  <span>{line.quantity}× {line.name}</span>
                  {line.station && <span className="kitchen-line-station">{line.station}</span>}
                  {line.notes && <span className="kitchen-line-note">{line.notes}</span>}
                </div>
              ))}
            </div>

            <div className="kitchen-ticket-actions">
              <button
                disabled={busyId === ticket.id || !previousStage(ticket.status)}
                onClick={() => { const prev = previousStage(ticket.status); if (prev) changeStatus(ticket, prev) }}
              >
                Recall
              </button>
              <button
                className="primary-button"
                disabled={busyId === ticket.id || !nextStage(ticket.status)}
                onClick={() => { const next = nextStage(ticket.status); if (next) changeStatus(ticket, next) }}
              >
                {ticket.status === 'Sent' ? 'Start preparing' : ticket.status === 'Preparing' ? 'Mark ready' : 'Ready'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}

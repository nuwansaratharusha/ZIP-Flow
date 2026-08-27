import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { archiveTable, createTable, getTables, updateTable } from './api'
import { openOrder } from '../orders/api'
import { TABLE_SECTIONS, type RestaurantTable } from './types'
import { useAuth } from '../auth/AuthContext'
import { isWaiterOnly } from '../auth/roles'
import '../../styles/tables.css'

type EditDraft = { name: string; section: string; capacity: string }

export function TablesPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const canManageTables = !isWaiterOnly(session?.roles)

  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [manageOpen, setManageOpen] = useState(false)

  // Owner setup state (behind the Manage toggle)
  const [name, setName] = useState('')
  const [section, setSection] = useState<string>(TABLE_SECTIONS[0])
  const [capacity, setCapacity] = useState('4')
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: '', section: TABLE_SECTIONS[0], capacity: '4' })
  const [editError, setEditError] = useState('')

  // Open-table dialog state
  const [openTarget, setOpenTarget] = useState<RestaurantTable | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [openError, setOpenError] = useState('')
  const [opening, setOpening] = useState(false)
  const pendingOrderIdRef = useRef<string | null>(null)

  const refetch = () => getTables().then(setTables)

  useEffect(() => {
    refetch()
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load tables.'))
      .finally(() => setLoading(false))
  }, [])

  const activeTables = useMemo(() => tables.filter((t) => !t.isArchived), [tables])

  const sections = useMemo(() => {
    const present = new Set(activeTables.map((t) => t.section))
    return TABLE_SECTIONS.filter((s) => present.has(s))
  }, [activeTables])

  const submitAdd = async (event: FormEvent) => {
    event.preventDefault()
    setAddError('')

    const cap = Number(capacity)
    if (!name.trim()) return setAddError('Table name is required.')
    if (!Number.isFinite(cap) || cap < 1) return setAddError('Capacity must be at least 1.')

    setSaving(true)
    try {
      const created = await createTable(name.trim(), section, cap)
      setTables((prev) => [...prev, created])
      setName('')
      setCapacity('4')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add table.')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (table: RestaurantTable) => {
    setEditingId(table.id)
    setEditError('')
    setEditDraft({ name: table.name, section: table.section, capacity: String(table.capacity) })
  }

  const saveEdit = async (table: RestaurantTable) => {
    setEditError('')
    const cap = Number(editDraft.capacity)
    if (!editDraft.name.trim()) return setEditError('Table name is required.')
    if (!Number.isFinite(cap) || cap < 1) return setEditError('Capacity must be at least 1.')

    try {
      const updated = await updateTable(table.id, editDraft.name.trim(), editDraft.section, cap)
      setTables((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      setEditingId(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update table.')
    }
  }

  const archive = async (table: RestaurantTable) => {
    await archiveTable(table.id)
    setTables((prev) => prev.filter((t) => t.id !== table.id))
  }

  const closeOpenDialog = () => {
    setOpenTarget(null)
    setCustomerName('')
    setCustomerPhone('')
    setOpenError('')
    pendingOrderIdRef.current = null
  }

  const handleTableTap = (table: RestaurantTable) => {
    if (table.status === 'occupied' && table.openOrderId) {
      navigate(`/pos/${table.openOrderId}`)
      return
    }
    // available and reserved (no flow yet) both open the "start service" dialog
    setOpenTarget(table)
    setCustomerName('')
    setCustomerPhone('')
    setOpenError('')
    pendingOrderIdRef.current = null
  }

  const confirmOpenTable = async (event: FormEvent) => {
    event.preventDefault()
    if (!openTarget) return
    setOpenError('')

    if (!customerName.trim()) {
      setOpenError('Customer name is required.')
      return
    }

    // Reuse the same client-generated id across retries of this dialog so a
    // dropped connection followed by a retry can't open a duplicate order.
    if (!pendingOrderIdRef.current) {
      pendingOrderIdRef.current = crypto.randomUUID()
    }

    setOpening(true)
    try {
      const order = await openOrder(
        openTarget.id,
        customerName.trim(),
        customerPhone.trim() || undefined,
        pendingOrderIdRef.current
      )
      pendingOrderIdRef.current = null
      closeOpenDialog()
      navigate(`/pos/${order.id}`)
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Failed to open table.')
      await refetch().catch(() => undefined)
    } finally {
      setOpening(false)
    }
  }

  if (loading) {
    return (
      <main className="content menu-content">
        <p className="muted">Loading tables…</p>
      </main>
    )
  }

  return (
    <main className="content menu-content">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Service</p>
          <h1>Tables</h1>
          <p className="muted">Tap an available table to seat a customer, or an occupied table to resume its order.</p>
        </div>
        {canManageTables && (
          <button
            type="button"
            className="secondary-button"
            aria-pressed={manageOpen}
            onClick={() => setManageOpen((prev) => !prev)}
          >
            {manageOpen ? 'Done managing' : 'Manage'}
          </button>
        )}
      </div>

      {loadError && <div className="alert error">{loadError}</div>}

      {!manageOpen && (
        <section className="section-card tables-floorplan">
          <div className="section-heading">
            <div><p className="eyebrow">Floor plan</p><h2>Tables</h2></div>
          </div>

          {activeTables.length === 0 && (
            <p className="muted menu-empty">No tables yet. Use Manage to add one.</p>
          )}

          {sections.map((sec) => (
            <div className="tables-floorplan-section" key={sec}>
              <p className="table-section-label tables-floorplan-section-label">{sec}</p>
              <div className="tables-floorplan-grid">
                {activeTables
                  .filter((t) => t.section === sec)
                  .map((table) => (
                    <button
                      type="button"
                      key={table.id}
                      className="pos-table-card tables-floorplan-card"
                      onClick={() => handleTableTap(table)}
                    >
                      <div className="table-card-top">
                        <strong>{table.name}</strong>
                        <span className={`table-status-badge ${table.status}`}>{table.status}</span>
                      </div>
                      {table.status === 'occupied' && table.openOrderCustomerName && (
                        <p className="muted tables-floorplan-customer">{table.openOrderCustomerName}</p>
                      )}
                      <div className="table-card-bottom">
                        <span className="table-capacity-chip">{table.capacity} seats</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {manageOpen && (
        <section className="section-card">
          <div className="section-heading">
            <div><p className="eyebrow">Owner setup</p><h2>Manage tables</h2></div>
          </div>

          {tables.length === 0 && <p className="muted menu-empty">No tables yet. Add one below.</p>}

          {tables.length > 0 && (
            <div className="menu-table tables-table">
              <div className="menu-row menu-row-head tables-row">
                <span>Name</span>
                <span>Section</span>
                <span>Capacity</span>
                <span>Status</span>
                <span></span>
              </div>
              {tables.map((table) => (
                <div className="menu-row tables-row" key={table.id}>
                  {editingId === table.id ? (
                    <>
                      <input className="inventory-edit-input" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                      <select className="inventory-edit-input" value={editDraft.section} onChange={(e) => setEditDraft({ ...editDraft, section: e.target.value })}>
                        {TABLE_SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input className="inventory-edit-input" inputMode="numeric" value={editDraft.capacity} onChange={(e) => setEditDraft({ ...editDraft, capacity: e.target.value })} />
                      <span className={`table-status-badge ${table.status}`}>{table.status}</span>
                      <span className="inventory-row-actions">
                        <button className="menu-price-edit" onClick={() => saveEdit(table)}>Save</button>
                        <button className="menu-archive" onClick={() => setEditingId(null)}>Cancel</button>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="menu-item-name">{table.name}</span>
                      <span className="muted">{table.section}</span>
                      <span className="muted">{table.capacity} seats</span>
                      <span className={`table-status-badge ${table.status}`}>{table.status}</span>
                      <span className="inventory-row-actions">
                        <button className="menu-price-edit" onClick={() => startEdit(table)}>Edit</button>
                        <button className="menu-archive" onClick={() => archive(table)}>Archive</button>
                      </span>
                    </>
                  )}
                </div>
              ))}
              {editingId && editError && <div className="alert error inventory-edit-error">{editError}</div>}
            </div>
          )}

          <form className="menu-add-form" onSubmit={submitAdd}>
            <p className="eyebrow">Add table</p>
            <div className="menu-add-fields tables-add-fields">
              <input placeholder="Table name (e.g. Table 15)" value={name} onChange={(e) => setName(e.target.value)} />
              <select value={section} onChange={(e) => setSection(e.target.value)}>
                {TABLE_SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input placeholder="Capacity" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add table'}</button>
            </div>
            {addError && <div className="alert error">{addError}</div>}
          </form>
        </section>
      )}

      {openTarget && (
        <div
          className="modal-backdrop"
          onClick={closeOpenDialog}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeOpenDialog()
          }}
        >
          <div
            className="modal-card tables-open-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="open-table-title"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={confirmOpenTable}>
              <div className="modal-header">
                <div className="modal-title-group">
                  <h3 id="open-table-title">Seat {openTarget.name}</h3>
                  <p>Capture the customer to start service.</p>
                </div>
                <button type="button" className="close-btn" aria-label="Close" onClick={closeOpenDialog}>×</button>
              </div>

              {openError && <div className="alert error table-modal-error">{openError}</div>}

              <div className="tables-open-modal-fields">
                <div className="form-input-group">
                  <label htmlFor="open-table-customer-name">Customer name</label>
                  <input
                    id="open-table-customer-name"
                    autoFocus
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                    required
                  />
                </div>
                <div className="form-input-group">
                  <label htmlFor="open-table-customer-phone">Phone (optional)</label>
                  <input
                    id="open-table-customer-phone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Phone number"
                  />
                </div>
              </div>

              <div className="table-modal-footer">
                <button type="button" className="secondary-button" onClick={closeOpenDialog}>Cancel</button>
                <button type="submit" className="primary-button" disabled={opening}>
                  {opening ? 'Opening…' : 'Open table'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Toast'
import { useAuth } from '../auth/AuthContext'
import { isWaiterOnly } from '../auth/roles'
import { openOrder } from '../orders/api'
import { archiveTable, createTable, getTables, updateTable } from './api'
import { TABLE_SECTIONS, type RestaurantTable } from './types'
import '../../styles/tables.css'

type EditDraft = { name: string; section: string; capacity: string }

export function TablesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const posBase = location.pathname.startsWith('/waiter') ? '/waiter/pos' : '/pos'
  const { session } = useAuth()
  const toast = useToast()
  const canManageTables = !isWaiterOnly(session?.roles)

  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [manageOpen, setManageOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

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
  const [guestCount, setGuestCount] = useState<number>(2)
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

  const sectionsList = useMemo(() => {
    const present = new Set(activeTables.map((t) => t.section))
    return TABLE_SECTIONS.filter((s) => present.has(s))
  }, [activeTables])

  const filteredTables = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return activeTables.filter((t) => {
      if (activeSection !== 'all' && t.section !== activeSection) return false
      if (query) {
        const matchesName = t.name.toLowerCase().includes(query)
        const matchesCustomer = t.openOrderCustomerName?.toLowerCase().includes(query)
        const matchesSection = t.section.toLowerCase().includes(query)
        return matchesName || matchesCustomer || matchesSection
      }
      return true
    })
  }, [activeTables, activeSection, searchQuery])

  const occupiedCount = useMemo(() => activeTables.filter((t) => t.status === 'occupied').length, [activeTables])
  const availableCount = useMemo(() => activeTables.filter((t) => t.status === 'available').length, [activeTables])

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
      toast.success(`Table "${created.name}" created successfully.`)
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
      toast.success(`Table "${updated.name}" updated.`)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update table.')
    }
  }

  const archive = async (table: RestaurantTable) => {
    if (!window.confirm(`Archive table "${table.name}"?`)) return
    try {
      await archiveTable(table.id)
      setTables((prev) => prev.filter((t) => t.id !== table.id))
      toast.info(`Table "${table.name}" archived.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive table.')
    }
  }

  const closeOpenDialog = () => {
    setOpenTarget(null)
    setCustomerName('')
    setCustomerPhone('')
    setGuestCount(2)
    setOpenError('')
    pendingOrderIdRef.current = null
  }

  const handleTableTap = (table: RestaurantTable) => {
    if (table.status === 'occupied' && table.openOrderId) {
      navigate(`${posBase}/${table.openOrderId}`)
      return
    }
    setOpenTarget(table)
    setCustomerName('')
    setCustomerPhone('')
    setGuestCount(Math.min(2, table.capacity || 2))
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

    if (!pendingOrderIdRef.current) {
      pendingOrderIdRef.current = crypto.randomUUID()
    }

    setOpening(true)
    try {
      const order = await openOrder(
        openTarget.id,
        customerName.trim(),
        customerPhone.trim() || undefined,
        pendingOrderIdRef.current,
      )
      pendingOrderIdRef.current = null
      closeOpenDialog()
      toast.success(`Table ${openTarget.name} seated for ${customerName.trim()}.`)
      navigate(`${posBase}/${order.id}`)
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
        <div className="loading-container">
          <div className="btn-spinner large" />
          <p className="muted">Loading tables floor plan…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="content tables-page-content">
      {/* Floor Plan Header */}
      <div className="dashboard-hero tables-hero">
        <div>
          <p className="eyebrow">Service Floor</p>
          <h1>Floor Plan &amp; Tables</h1>
          <p className="muted">
            {occupiedCount > 0
              ? `${occupiedCount} table${occupiedCount === 1 ? '' : 's'} active · ${availableCount} available for seating.`
              : `All ${activeTables.length} tables are available. Tap any table to seat a customer.`}
          </p>
        </div>
        <div className="tables-header-actions">
          {canManageTables && (
            <button
              type="button"
              className={`secondary-button ${manageOpen ? 'active-toggle' : ''}`}
              aria-pressed={manageOpen}
              onClick={() => setManageOpen((prev) => !prev)}
            >
              <Icon name={manageOpen ? 'check' : 'settings'} size={16} />
              {manageOpen ? 'Done Managing' : 'Manage Layout'}
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="alert error">
          <Icon name="alertTriangle" size={16} /> {loadError}
        </div>
      )}

      {/* Main Service View */}
      {!manageOpen && (
        <>
          {/* Section Filter & Search Toolbar */}
          <div className="tables-toolbar">
            <div className="section-filter-pills">
              <button
                type="button"
                className={`filter-pill ${activeSection === 'all' ? 'active' : ''}`}
                onClick={() => setActiveSection('all')}
              >
                All Sections <span className="pill-count">{activeTables.length}</span>
              </button>
              {sectionsList.map((sec) => {
                const count = activeTables.filter((t) => t.section === sec).length
                return (
                  <button
                    key={sec}
                    type="button"
                    className={`filter-pill ${activeSection === sec ? 'active' : ''}`}
                    onClick={() => setActiveSection(sec)}
                  >
                    {sec} <span className="pill-count">{count}</span>
                  </button>
                )
              })}
            </div>

            <div className="tables-search-wrapper">
              <Icon name="search" size={16} />
              <input
                type="text"
                placeholder="Search table or guest…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Tables Floor Plan Grid */}
          <section className="section-card tables-floorplan">
            {filteredTables.length === 0 && (
              <div className="empty-tables-view">
                <Icon name="grid" size={36} />
                <h3>No tables match</h3>
                <p className="muted">
                  {searchQuery ? `No tables found matching "${searchQuery}".` : 'No tables added yet. Click "Manage Layout" above to add tables.'}
                </p>
                {canManageTables && !searchQuery && (
                  <button type="button" className="primary-button sm" onClick={() => setManageOpen(true)}>
                    <Icon name="plus" size={16} /> Add First Table
                  </button>
                )}
              </div>
            )}

            {filteredTables.length > 0 && (
              <div className="tables-floorplan-grid">
                {filteredTables.map((table) => {
                  const isOccupied = table.status === 'occupied'
                  return (
                    <button
                      type="button"
                      key={table.id}
                      className={`pos-table-card ${isOccupied ? 'is-occupied' : 'is-available'}`}
                      onClick={() => handleTableTap(table)}
                      title={isOccupied ? `Resume order for ${table.name}` : `Seat guest at ${table.name}`}
                    >
                      <div className="table-card-top">
                        <div className="table-name-group">
                          <strong className="table-card-title">{table.name}</strong>
                          <span className="table-section-tag">{table.section}</span>
                        </div>
                        <span className={`table-status-badge ${table.status}`}>
                          <span className="status-indicator-dot" />
                          {isOccupied ? 'Occupied' : 'Available'}
                        </span>
                      </div>

                      <div className="table-card-middle">
                        {isOccupied ? (
                          <div className="table-guest-info">
                            <span className="guest-label">Guest</span>
                            <strong className="guest-name">
                              <Icon name="user" size={13} /> {table.openOrderCustomerName || 'Walk-in'}
                            </strong>
                          </div>
                        ) : (
                          <div className="table-seat-prompt">
                            <span>Tap to seat guest</span>
                          </div>
                        )}
                      </div>

                      <div className="table-card-bottom">
                        <span className="table-capacity-chip">
                          <Icon name="users" size={13} /> {table.capacity} seats
                        </span>
                        <span className="table-action-hint">
                          {isOccupied ? (
                            <>
                              Resume <Icon name="arrowRight" size={12} />
                            </>
                          ) : (
                            <>
                              Seat <Icon name="plus" size={12} />
                            </>
                          )}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* Owner Setup / Manage Mode */}
      {manageOpen && (
        <section className="section-card manage-tables-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Restaurant Floor</p>
              <h2>Manage Tables &amp; Layout</h2>
            </div>
            <span className="quiet-pill">{tables.length} Total Tables</span>
          </div>

          {/* Add Table Form Card */}
          <form className="manage-add-table-card" onSubmit={submitAdd}>
            <div className="form-card-header">
              <Icon name="plus" size={18} />
              <strong>Add New Table</strong>
            </div>
            <div className="tables-add-fields">
              <div className="input-with-label">
                <label>Table Name</label>
                <input
                  placeholder="e.g. Table 15, Booth 4"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="input-with-label">
                <label>Section</label>
                <select value={section} onChange={(e) => setSection(e.target.value)}>
                  {TABLE_SECTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-with-label">
                <label>Max Seats</label>
                <input
                  placeholder="4"
                  type="number"
                  min="1"
                  max="50"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  required
                />
              </div>
              <button className="primary-button add-table-submit-btn" type="submit" disabled={saving}>
                {saving ? 'Adding…' : 'Add Table'}
              </button>
            </div>
            {addError && (
              <div className="alert error">
                <Icon name="alertTriangle" size={14} /> {addError}
              </div>
            )}
          </form>

          {/* Existing Tables List Table */}
          {tables.length === 0 ? (
            <p className="muted menu-empty">No tables created yet. Use the form above to add one.</p>
          ) : (
            <div className="menu-table tables-table">
              <div className="menu-row menu-row-head tables-row">
                <span>Table Name</span>
                <span>Section</span>
                <span>Capacity</span>
                <span>Status</span>
                <span className="actions-header">Actions</span>
              </div>
              {tables.map((table) => (
                <div className="menu-row tables-row" key={table.id}>
                  {editingId === table.id ? (
                    <>
                      <input
                        className="inventory-edit-input"
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        autoFocus
                      />
                      <select
                        className="inventory-edit-input"
                        value={editDraft.section}
                        onChange={(e) => setEditDraft({ ...editDraft, section: e.target.value })}
                      >
                        {TABLE_SECTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <input
                        className="inventory-edit-input"
                        type="number"
                        min="1"
                        max="50"
                        value={editDraft.capacity}
                        onChange={(e) => setEditDraft({ ...editDraft, capacity: e.target.value })}
                      />
                      <span className={`table-status-badge ${table.status}`}>{table.status}</span>
                      <span className="inventory-row-actions">
                        <button className="menu-price-edit save-btn" onClick={() => saveEdit(table)}>
                          <Icon name="check" size={14} /> Save
                        </button>
                        <button className="menu-archive cancel-btn" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="menu-item-name">
                        <strong>{table.name}</strong>
                      </span>
                      <span className="muted">{table.section}</span>
                      <span className="muted">{table.capacity} seats</span>
                      <span>
                        <span className={`table-status-badge ${table.status}`}>{table.status}</span>
                      </span>
                      <span className="inventory-row-actions">
                        <button className="menu-price-edit" onClick={() => startEdit(table)} title="Edit Table">
                          <Icon name="edit" size={14} /> Edit
                        </button>
                        <button className="menu-archive" onClick={() => archive(table)} title="Archive Table">
                          <Icon name="trash" size={14} /> Archive
                        </button>
                      </span>
                    </>
                  )}
                </div>
              ))}
              {editingId && editError && (
                <div className="alert error inventory-edit-error">
                  <Icon name="alertTriangle" size={14} /> {editError}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Seat Guest Modal Dialog */}
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
                  <div className="modal-badge">
                    <Icon name="utensils" size={16} /> Seat Service
                  </div>
                  <h3 id="open-table-title">Seat {openTarget.name}</h3>
                  <p className="muted">
                    {openTarget.section} · Up to {openTarget.capacity} seats
                  </p>
                </div>
                <button type="button" className="close-btn" aria-label="Close modal" onClick={closeOpenDialog}>
                  <Icon name="close" size={16} />
                </button>
              </div>

              {openError && (
                <div className="alert error table-modal-error">
                  <Icon name="alertTriangle" size={14} /> {openError}
                </div>
              )}

              <div className="tables-open-modal-fields">
                <div className="form-input-group">
                  <label htmlFor="open-table-customer-name">
                    Customer / Party Name <span className="required-star">*</span>
                  </label>
                  <div className="input-icon-wrapper">
                    <Icon name="user" size={16} />
                    <input
                      id="open-table-customer-name"
                      autoFocus
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. John Doe, Table VIP"
                      required
                    />
                  </div>
                </div>

                <div className="form-input-group">
                  <label htmlFor="open-table-customer-phone">Phone Number (Optional)</label>
                  <div className="input-icon-wrapper">
                    <Icon name="phone" size={16} />
                    <input
                      id="open-table-customer-phone"
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="e.g. +1 555 0192"
                    />
                  </div>
                </div>

                <div className="form-input-group">
                  <label>Guests Count</label>
                  <div className="guest-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setGuestCount((prev) => Math.max(1, prev - 1))}
                      disabled={guestCount <= 1}
                      aria-label="Decrease guest count"
                    >
                      <Icon name="minus" size={14} />
                    </button>
                    <span className="guest-stepper-val">
                      <strong>{guestCount}</strong> {guestCount === 1 ? 'Guest' : 'Guests'}
                    </span>
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setGuestCount((prev) => Math.min(openTarget.capacity || 20, prev + 1))}
                      aria-label="Increase guest count"
                    >
                      <Icon name="plus" size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="table-modal-footer">
                <button type="button" className="secondary-button" onClick={closeOpenDialog}>
                  Cancel
                </button>
                <button type="submit" className="primary-button confirm-open-btn" disabled={opening}>
                  {opening ? (
                    <>
                      <span className="btn-spinner" /> Opening…
                    </>
                  ) : (
                    <>
                      Open Table &amp; Start POS <Icon name="arrowRight" size={14} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

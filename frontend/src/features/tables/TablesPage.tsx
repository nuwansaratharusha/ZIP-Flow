import { FormEvent, useEffect, useState } from 'react'
import { archiveTable, createTable, getTables, setTableStatus, updateTable } from './api'
import { TABLE_SECTIONS, type RestaurantTable, type TableStatus } from './types'

type EditDraft = { name: string; section: string; capacity: string }

export function TablesPage() {
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [name, setName] = useState('')
  const [section, setSection] = useState<string>(TABLE_SECTIONS[0])
  const [capacity, setCapacity] = useState('4')
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: '', section: TABLE_SECTIONS[0], capacity: '4' })
  const [editError, setEditError] = useState('')

  const refetch = () => getTables().then(setTables)

  useEffect(() => {
    refetch()
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load tables.'))
      .finally(() => setLoading(false))
  }, [])

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

  const changeStatus = async (table: RestaurantTable, status: TableStatus) => {
    const updated = await setTableStatus(table.id, status)
    setTables((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }

  const archive = async (table: RestaurantTable) => {
    await archiveTable(table.id)
    setTables((prev) => prev.filter((t) => t.id !== table.id))
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
          <p className="eyebrow">Business module</p>
          <h1>Tables</h1>
          <p className="muted">Floor plan details shared with the POS table picker.</p>
        </div>
      </div>

      {loadError && <div className="alert error">{loadError}</div>}

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Floor plan</p><h2>Tables</h2></div>
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
                    <span>
                      <select
                        className="table-status-select"
                        value={table.status}
                        onChange={(e) => changeStatus(table, e.target.value as TableStatus)}
                      >
                        <option value="available">Available</option>
                        <option value="occupied">Occupied</option>
                        <option value="reserved">Reserved</option>
                      </select>
                    </span>
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
    </main>
  )
}

import { FormEvent, useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import {
  addCurrency,
  getCurrencies,
  getReceiptSettings,
  getTaxSettings,
  removeCurrency,
  updateBaseCurrency,
  updateCurrency,
  updateReceiptSettings,
  updateTaxSettings,
} from './api'
import type { CurrencySettings } from './types'

export function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [businessName, setBusinessName] = useState('')
  const [footerMessage, setFooterMessage] = useState('')
  const [showTaxId, setShowTaxId] = useState(false)
  const [taxId, setTaxId] = useState('')
  const [showCollectionCode, setShowCollectionCode] = useState(true)

  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const [currencySettings, setCurrencySettings] = useState<CurrencySettings | null>(null)
  const [baseCode, setBaseCode] = useState('')
  const [baseSymbol, setBaseSymbol] = useState('')
  const [baseSaving, setBaseSaving] = useState(false)
  const [baseError, setBaseError] = useState('')

  const [drafts, setDrafts] = useState<Record<string, { symbol: string; rate: string }>>({})
  const [rowSavingId, setRowSavingId] = useState<string | null>(null)
  const [currencyError, setCurrencyError] = useState('')

  const [newCode, setNewCode] = useState('')
  const [newSymbol, setNewSymbol] = useState('')
  const [newRate, setNewRate] = useState('')
  const [addingCurrency, setAddingCurrency] = useState(false)

  const [vatRate, setVatRate] = useState('')
  const [serviceChargeRate, setServiceChargeRate] = useState('')
  const [taxSaving, setTaxSaving] = useState(false)
  const [taxError, setTaxError] = useState('')
  const [taxSaved, setTaxSaved] = useState(false)

  const applyCurrencySettings = (settings: CurrencySettings) => {
    setCurrencySettings(settings)
    setBaseCode(settings.baseCode)
    setBaseSymbol(settings.baseSymbol)
    setDrafts(Object.fromEntries(settings.supported.map((c) => [c.id!, { symbol: c.symbol, rate: String(c.rate) }])))
  }

  useEffect(() => {
    Promise.all([getReceiptSettings(), getCurrencies(), getTaxSettings()])
      .then(([receipt, currencies, tax]) => {
        setBusinessName(receipt.businessName)
        setFooterMessage(receipt.footerMessage)
        setShowTaxId(receipt.showTaxId)
        setTaxId(receipt.taxId ?? '')
        setShowCollectionCode(receipt.showCollectionCode)
        applyCurrencySettings(currencies)
        setVatRate(String(tax.vatRatePercent))
        setServiceChargeRate(String(tax.serviceChargeRatePercent))
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load settings.'))
      .finally(() => setLoading(false))
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaveError('')
    setSaved(false)

    if (showTaxId && !taxId.trim()) return setSaveError('Enter a tax ID, or turn off "Show tax ID on receipt".')

    setSaving(true)
    try {
      const updated = await updateReceiptSettings({
        businessName: businessName.trim() || null,
        footerMessage: footerMessage.trim(),
        showTaxId,
        taxId: taxId.trim() || null,
        showCollectionCode,
      })
      setBusinessName(updated.businessName)
      setFooterMessage(updated.footerMessage)
      setTaxId(updated.taxId ?? '')
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  const saveBaseCurrency = async (event: FormEvent) => {
    event.preventDefault()
    setBaseError('')
    if (!baseCode.trim() || !baseSymbol.trim()) return setBaseError('A currency code and symbol are required.')

    setBaseSaving(true)
    try {
      applyCurrencySettings(await updateBaseCurrency(baseCode.trim(), baseSymbol.trim()))
    } catch (err) {
      setBaseError(err instanceof Error ? err.message : 'Failed to update base currency.')
    } finally {
      setBaseSaving(false)
    }
  }

  const saveRow = async (id: string) => {
    setCurrencyError('')
    const draft = drafts[id]
    const rate = Number(draft.rate)
    if (!draft.symbol.trim() || !(rate > 0)) return setCurrencyError('Enter a symbol and a rate greater than zero.')

    setRowSavingId(id)
    try {
      applyCurrencySettings(await updateCurrency(id, draft.symbol.trim(), rate))
    } catch (err) {
      setCurrencyError(err instanceof Error ? err.message : 'Failed to update currency.')
    } finally {
      setRowSavingId(null)
    }
  }

  const removeRow = async (id: string) => {
    setCurrencyError('')
    setRowSavingId(id)
    try {
      applyCurrencySettings(await removeCurrency(id))
    } catch (err) {
      setCurrencyError(err instanceof Error ? err.message : 'Failed to remove currency.')
    } finally {
      setRowSavingId(null)
    }
  }

  const addNewCurrency = async (event: FormEvent) => {
    event.preventDefault()
    setCurrencyError('')
    const rate = Number(newRate)
    if (!newCode.trim() || !newSymbol.trim() || !(rate > 0))
      return setCurrencyError('Enter a code, symbol, and a rate greater than zero.')

    setAddingCurrency(true)
    try {
      applyCurrencySettings(await addCurrency(newCode.trim(), newSymbol.trim(), rate))
      setNewCode('')
      setNewSymbol('')
      setNewRate('')
    } catch (err) {
      setCurrencyError(err instanceof Error ? err.message : 'Failed to add currency.')
    } finally {
      setAddingCurrency(false)
    }
  }

  const saveTaxSettings = async (event: FormEvent) => {
    event.preventDefault()
    setTaxError('')
    setTaxSaved(false)

    const vat = Number(vatRate)
    const serviceCharge = Number(serviceChargeRate)
    if (!(vat >= 0 && vat <= 100)) return setTaxError('VAT rate must be between 0 and 100.')
    if (!(serviceCharge >= 0 && serviceCharge <= 100)) return setTaxError('Service charge rate must be between 0 and 100.')

    setTaxSaving(true)
    try {
      const updated = await updateTaxSettings(vat, serviceCharge)
      setVatRate(String(updated.vatRatePercent))
      setServiceChargeRate(String(updated.serviceChargeRatePercent))
      setTaxSaved(true)
    } catch (err) {
      setTaxError(err instanceof Error ? err.message : 'Failed to save charges.')
    } finally {
      setTaxSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="content menu-content">
        <p className="muted">Loading settings…</p>
      </main>
    )
  }

  return (
    <main className="content menu-content">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Settings</h1>
          <p className="muted">Customize receipts and the currencies available at checkout.</p>
        </div>
      </div>

      {loadError && <div className="alert error">{loadError}</div>}

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Receipt</p><h2>Content &amp; branding</h2></div>
        </div>

        <form className="settings-form" onSubmit={submit}>
          <label className="settings-field">
            Business name
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Shown at the top of every receipt" />
          </label>

          <label className="settings-field">
            Footer message
            <input value={footerMessage} onChange={(e) => setFooterMessage(e.target.value)} placeholder="e.g. Thank you for your visit!" />
          </label>

          <label className="settings-checkbox">
            <input type="checkbox" checked={showTaxId} onChange={(e) => setShowTaxId(e.target.checked)} />
            Show tax / VAT ID on receipt
          </label>

          {showTaxId && (
            <label className="settings-field">
              Tax / VAT ID
              <input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="e.g. VAT-123456" />
            </label>
          )}

          <label className="settings-checkbox">
            <input type="checkbox" checked={showCollectionCode} onChange={(e) => setShowCollectionCode(e.target.checked)} />
            Show collection code on Takeaway / Delivery receipts
          </label>

          {saveError && <div className="alert error">{saveError}</div>}
          {saved && !saveError && <div className="alert success">Settings saved.</div>}

          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Charges</p><h2>VAT &amp; service charge</h2></div>
        </div>

        <form className="settings-form currency-base-form" onSubmit={saveTaxSettings}>
          <label className="settings-field">
            VAT rate (%)
            <input value={vatRate} onChange={(e) => setVatRate(e.target.value)} type="number" step="0.01" min="0" max="100" placeholder="e.g. 20" />
          </label>
          <label className="settings-field">
            Service charge rate (%)
            <input value={serviceChargeRate} onChange={(e) => setServiceChargeRate(e.target.value)} type="number" step="0.01" min="0" max="100" placeholder="e.g. 12.5" />
          </label>
          {taxError && <div className="alert error">{taxError}</div>}
          {taxSaved && !taxError && <div className="alert success">Charges saved.</div>}
          <button className="primary-button" type="submit" disabled={taxSaving}>
            {taxSaving ? 'Saving…' : 'Save charges'}
          </button>
        </form>

        <p className="muted currency-section-note">
          Applied automatically to every order: the service charge is calculated on the subtotal, then VAT is calculated
          on the subtotal plus the service charge. Set service charge to 0 to leave it off.
        </p>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Currency</p><h2>Base currency &amp; exchange rates</h2></div>
        </div>

        <form className="settings-form currency-base-form" onSubmit={saveBaseCurrency}>
          <label className="settings-field">
            Base currency code
            <input value={baseCode} onChange={(e) => setBaseCode(e.target.value)} placeholder="e.g. GBP" maxLength={12} />
          </label>
          <label className="settings-field">
            Symbol
            <input value={baseSymbol} onChange={(e) => setBaseSymbol(e.target.value)} placeholder="e.g. £" maxLength={8} />
          </label>
          {baseError && <div className="alert error">{baseError}</div>}
          <button className="primary-button" type="submit" disabled={baseSaving}>
            {baseSaving ? 'Saving…' : 'Save base currency'}
          </button>
        </form>

        <p className="muted currency-section-note">
          All prices are entered and stored in the base currency. Cashiers can switch to any currency below at the POS —
          amounts are converted using the rate you set here.
        </p>

        {currencySettings && currencySettings.supported.length > 0 && (
          <div className="menu-table currency-table">
            <div className="menu-row menu-row-head currency-row">
              <span>Code</span>
              <span>Symbol</span>
              <span>Rate (per 1 {currencySettings.baseCode})</span>
              <span></span>
            </div>
            {currencySettings.supported.map((c) => (
              <div className="menu-row currency-row" key={c.id}>
                <span className="menu-item-name">{c.code}</span>
                <input
                  className="currency-inline-input"
                  value={drafts[c.id!]?.symbol ?? ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [c.id!]: { ...prev[c.id!], symbol: e.target.value } }))}
                />
                <input
                  className="currency-inline-input"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={drafts[c.id!]?.rate ?? ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [c.id!]: { ...prev[c.id!], rate: e.target.value } }))}
                />
                <span className="currency-row-actions">
                  <button type="button" onClick={() => saveRow(c.id!)} disabled={rowSavingId === c.id}>Save</button>
                  <button type="button" onClick={() => removeRow(c.id!)} disabled={rowSavingId === c.id}>
                    <Icon name="trash" size={12} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        <form className="new-table-drawer currency-add-form" onSubmit={addNewCurrency}>
          <p className="new-table-drawer-title">Add a supported currency</p>
          <div className="new-table-form-row">
            <div className="form-input-group">
              <label>Code</label>
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="e.g. USD" maxLength={12} />
            </div>
            <div className="form-input-group">
              <label>Symbol</label>
              <input value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder="e.g. $" maxLength={8} />
            </div>
            <div className="form-input-group">
              <label>Rate</label>
              <input value={newRate} onChange={(e) => setNewRate(e.target.value)} type="number" step="0.0001" min="0" placeholder="e.g. 1.27" />
            </div>
            <button type="submit" className="pill-btn pill-btn-primary sm" disabled={addingCurrency} style={{ alignSelf: 'flex-end', height: '38px' }}>
              {addingCurrency ? 'Adding…' : 'Add currency'}
            </button>
          </div>
        </form>

        {currencyError && <div className="alert error">{currencyError}</div>}
      </section>
    </main>
  )
}

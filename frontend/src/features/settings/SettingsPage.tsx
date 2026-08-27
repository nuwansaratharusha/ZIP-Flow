import { FormEvent, useEffect, useState } from 'react'
import { getPrinterSettings, getReceiptSettings, getTaxSettings, updatePrinterSettings, updateReceiptSettings, updateTaxSettings } from './api'

export function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [businessName, setBusinessName] = useState('')
  const [footerMessage, setFooterMessage] = useState('')
  const [showTaxId, setShowTaxId] = useState(false)
  const [taxId, setTaxId] = useState('')

  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const [vatRate, setVatRate] = useState('')
  const [serviceChargeRate, setServiceChargeRate] = useState('')
  const [taxSaving, setTaxSaving] = useState(false)
  const [taxError, setTaxError] = useState('')
  const [taxSaved, setTaxSaved] = useState(false)

  const [printerIp, setPrinterIp] = useState('')
  const [printerPort, setPrinterPort] = useState('9100')
  const [printerSaving, setPrinterSaving] = useState(false)
  const [printerError, setPrinterError] = useState('')
  const [printerSaved, setPrinterSaved] = useState(false)

  useEffect(() => {
    Promise.all([getReceiptSettings(), getTaxSettings(), getPrinterSettings()])
      .then(([receipt, tax, printer]) => {
        setBusinessName(receipt.businessName)
        setFooterMessage(receipt.footerMessage)
        setShowTaxId(receipt.showTaxId)
        setTaxId(receipt.taxId ?? '')
        setVatRate(String(tax.vatRatePercent))
        setServiceChargeRate(String(tax.serviceChargeRatePercent))
        setPrinterIp(printer.ipAddress ?? '')
        setPrinterPort(String(printer.port))
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

  const savePrinterSettings = async (event: FormEvent) => {
    event.preventDefault()
    setPrinterError('')
    setPrinterSaved(false)

    const port = Number(printerPort)
    if (!Number.isInteger(port) || port < 1 || port > 65535) return setPrinterError('Port must be between 1 and 65535.')

    setPrinterSaving(true)
    try {
      const updated = await updatePrinterSettings(printerIp.trim() || null, port)
      setPrinterIp(updated.ipAddress ?? '')
      setPrinterPort(String(updated.port))
      setPrinterSaved(true)
    } catch (err) {
      setPrinterError(err instanceof Error ? err.message : 'Failed to save printer settings.')
    } finally {
      setPrinterSaving(false)
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
          <p className="muted">Customize receipts and the charges applied to every order.</p>
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
          <div><p className="eyebrow">Hardware</p><h2>Counter printer</h2></div>
        </div>

        <form className="settings-form currency-base-form" onSubmit={savePrinterSettings}>
          <label className="settings-field">
            Printer IP address
            <input value={printerIp} onChange={(e) => setPrinterIp(e.target.value)} placeholder="e.g. 192.168.1.50" />
          </label>
          <label className="settings-field">
            Port
            <input value={printerPort} onChange={(e) => setPrinterPort(e.target.value)} type="number" min="1" max="65535" placeholder="9100" />
          </label>
          {printerError && <div className="alert error">{printerError}</div>}
          {printerSaved && !printerError && <div className="alert success">Printer settings saved.</div>}
          <button className="primary-button" type="submit" disabled={printerSaving}>
            {printerSaving ? 'Saving…' : 'Save printer'}
          </button>
        </form>

        <p className="muted currency-section-note">
          Round tickets and bills print here automatically when a waiter sends a round or closes an order.
        </p>
      </section>
    </main>
  )
}

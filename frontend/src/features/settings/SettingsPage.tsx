import { FormEvent, useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Toast'
import { useAuth } from '../auth/AuthContext'
import {
  getPrinterSettings,
  getReceiptSettings,
  getTaxSettings,
  testPrinter,
  updatePrinterSettings,
  updateReceiptSettings,
  updateTaxSettings,
} from './api'

type SettingsTab = 'receipt' | 'taxes' | 'printer'

export function SettingsPage() {
  const { session } = useAuth()
  const toast = useToast()
  const currencySymbol = session?.tenant.currencySymbol ?? '£'

  const [activeTab, setActiveTab] = useState<SettingsTab>('receipt')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Receipt Settings
  const [businessName, setBusinessName] = useState('')
  const [footerMessage, setFooterMessage] = useState('')
  const [showTaxId, setShowTaxId] = useState(false)
  const [taxId, setTaxId] = useState('')
  const [savingReceipt, setSavingReceipt] = useState(false)
  const [receiptError, setReceiptError] = useState('')

  // Tax Settings
  const [vatRate, setVatRate] = useState('20')
  const [serviceChargeRate, setServiceChargeRate] = useState('10')
  const [savingTaxes, setSavingTaxes] = useState(false)
  const [taxError, setTaxError] = useState('')

  // Printer Settings
  const [printerIp, setPrinterIp] = useState('')
  const [printerPort, setPrinterPort] = useState('9100')
  const [savingPrinter, setSavingPrinter] = useState(false)
  const [testingPrinter, setTestingPrinter] = useState(false)
  const [printerError, setPrinterError] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    Promise.all([getReceiptSettings(), getTaxSettings(), getPrinterSettings()])
      .then(([receipt, tax, printer]) => {
        setBusinessName(receipt.businessName || session?.tenant.name || '')
        setFooterMessage(receipt.footerMessage || 'Thank you for dining with us!')
        setShowTaxId(receipt.showTaxId)
        setTaxId(receipt.taxId ?? '')
        setVatRate(String(tax.vatRatePercent))
        setServiceChargeRate(String(tax.serviceChargeRatePercent))
        setPrinterIp(printer.ipAddress ?? '')
        setPrinterPort(String(printer.port))
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load settings.'))
      .finally(() => setLoading(false))
  }, [session?.tenant.name])

  const submitReceipt = async (event: FormEvent) => {
    event.preventDefault()
    setReceiptError('')

    if (showTaxId && !taxId.trim()) {
      setReceiptError('Enter a tax ID, or uncheck "Show tax ID on receipt".')
      return
    }

    setSavingReceipt(true)
    try {
      const updated = await updateReceiptSettings({
        businessName: businessName.trim() || null,
        footerMessage: footerMessage.trim(),
        showTaxId,
        taxId: taxId.trim() || null,
      })
      setBusinessName(updated.businessName || '')
      setFooterMessage(updated.footerMessage)
      setTaxId(updated.taxId ?? '')
      toast.success('Receipt branding settings saved successfully.')
    } catch (err) {
      setReceiptError(err instanceof Error ? err.message : 'Failed to save receipt settings.')
      toast.error('Failed to save receipt settings.')
    } finally {
      setSavingReceipt(false)
    }
  }

  const submitTaxes = async (event: FormEvent) => {
    event.preventDefault()
    setTaxError('')

    const vat = Number(vatRate)
    const serviceCharge = Number(serviceChargeRate)
    if (!(vat >= 0 && vat <= 100)) {
      setTaxError('VAT rate must be a valid percentage between 0 and 100.')
      return
    }
    if (!(serviceCharge >= 0 && serviceCharge <= 100)) {
      setTaxError('Service charge rate must be a valid percentage between 0 and 100.')
      return
    }

    setSavingTaxes(true)
    try {
      const updated = await updateTaxSettings(vat, serviceCharge)
      setVatRate(String(updated.vatRatePercent))
      setServiceChargeRate(String(updated.serviceChargeRatePercent))
      toast.success('VAT and Service Charge rates updated.')
    } catch (err) {
      setTaxError(err instanceof Error ? err.message : 'Failed to save charge rates.')
      toast.error('Failed to save charges.')
    } finally {
      setSavingTaxes(false)
    }
  }

  const submitPrinter = async (event: FormEvent) => {
    event.preventDefault()
    setPrinterError('')

    const port = Number(printerPort)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setPrinterError('Port must be a valid TCP port number between 1 and 65535.')
      return
    }

    setSavingPrinter(true)
    try {
      const updated = await updatePrinterSettings(printerIp.trim() || null, port)
      setPrinterIp(updated.ipAddress ?? '')
      setPrinterPort(String(updated.port))
      toast.success('Counter printer settings saved.')
    } catch (err) {
      setPrinterError(err instanceof Error ? err.message : 'Failed to save printer settings.')
      toast.error('Failed to save printer settings.')
    } finally {
      setSavingPrinter(false)
    }
  }

  const handleTestPrint = async () => {
    setPrinterError('')
    setTestResult(null)
    const port = Number(printerPort)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setPrinterError('Port must be a valid TCP port number between 1 and 65535.')
      return
    }

    setTestingPrinter(true)
    try {
      const res = await testPrinter(printerIp.trim() || null, port)
      setTestResult({ success: true, message: res.message })
      toast.success(res.message || 'Test ticket sent to printer!')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Printer unreachable.'
      setTestResult({ success: false, message: msg })
      toast.error(msg)
    } finally {
      setTestingPrinter(false)
    }
  }

  const selectDevice = (ip: string, port: number) => {
    setPrinterIp(ip)
    setPrinterPort(String(port))
    setTestResult(null)
    setPrinterError('')
    toast.info(`Selected ${ip}:${port}`)
  }

  if (loading) {
    return (
      <main className="content menu-content">
        <div className="loading-container">
          <div className="btn-spinner large" />
          <p className="muted">Loading system settings…</p>
        </div>
      </main>
    )
  }

  // Sample figures for live preview calculations
  const sampleSubtotal = 120.0
  const sampleVatNum = Number(vatRate) || 0
  const sampleScNum = Number(serviceChargeRate) || 0
  const sampleScAmount = (sampleSubtotal * sampleScNum) / 100
  const sampleVatAmount = ((sampleSubtotal + sampleScAmount) * sampleVatNum) / 100
  const sampleTotal = sampleSubtotal + sampleScAmount + sampleVatAmount

  return (
    <main className="content settings-page-content">
      {/* Header */}
      <div className="dashboard-hero settings-hero">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Settings &amp; Preferences</h1>
          <p className="muted">
            Configure receipt branding, automated tax rules, and physical ESC/POS counter printers.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="alert error">
          <Icon name="alertTriangle" size={16} /> {loadError}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="settings-nav-tabs">
        <button
          type="button"
          className={`settings-tab-btn ${activeTab === 'receipt' ? 'active' : ''}`}
          onClick={() => setActiveTab('receipt')}
        >
          <Icon name="receipt" size={16} />
          <span>Receipt &amp; Branding</span>
        </button>
        <button
          type="button"
          className={`settings-tab-btn ${activeTab === 'taxes' ? 'active' : ''}`}
          onClick={() => setActiveTab('taxes')}
        >
          <Icon name="tag" size={16} />
          <span>Taxes &amp; Service Charges</span>
        </button>
        <button
          type="button"
          className={`settings-tab-btn ${activeTab === 'printer' ? 'active' : ''}`}
          onClick={() => setActiveTab('printer')}
        >
          <Icon name="printer" size={16} />
          <span>Counter Printer</span>
        </button>
      </div>

      {/* Main Content Layout: Form Left, Thermal Receipt Mockup Right */}
      <div className="settings-split-grid">
        {/* Left Column: Active Form */}
        <div className="settings-forms-container">
          {/* Tab 1: Receipt Branding */}
          {activeTab === 'receipt' && (
            <section className="section-card settings-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Customer Documents</p>
                  <h2>Receipt &amp; Bill Branding</h2>
                </div>
              </div>

              <form className="settings-form" onSubmit={submitReceipt}>
                <label className="settings-field">
                  <span className="field-title">Business Display Name</span>
                  <input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. The Grand Bistro & Bar"
                  />
                  <small className="field-helper">Printed at the very top of round tickets and final bills.</small>
                </label>

                <label className="settings-field">
                  <span className="field-title">Receipt Footer Message</span>
                  <input
                    value={footerMessage}
                    onChange={(e) => setFooterMessage(e.target.value)}
                    placeholder="e.g. Thank you for dining with us!"
                  />
                  <small className="field-helper">Friendly farewell note or Wi-Fi code at the bottom of the bill.</small>
                </label>

                <div className="settings-checkbox-wrapper">
                  <label className="settings-checkbox">
                    <input
                      type="checkbox"
                      checked={showTaxId}
                      onChange={(e) => setShowTaxId(e.target.checked)}
                    />
                    <span>Print Tax / VAT Identification Number on receipt</span>
                  </label>
                </div>

                {showTaxId && (
                  <label className="settings-field">
                    <span className="field-title">Tax / VAT Number</span>
                    <input
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      placeholder="e.g. GB 982 1234 56"
                    />
                  </label>
                )}

                {receiptError && (
                  <div className="alert error">
                    <Icon name="alertTriangle" size={14} /> {receiptError}
                  </div>
                )}

                <button className="primary-button settings-save-btn" type="submit" disabled={savingReceipt}>
                  {savingReceipt ? (
                    <>
                      <span className="btn-spinner" /> Saving…
                    </>
                  ) : (
                    <>
                      <Icon name="check" size={15} /> Save Receipt Settings
                    </>
                  )}
                </button>
              </form>
            </section>
          )}

          {/* Tab 2: Taxes & Charges */}
          {activeTab === 'taxes' && (
            <section className="section-card settings-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Automated Calculations</p>
                  <h2>VAT &amp; Service Charges</h2>
                </div>
              </div>

              <form className="settings-form" onSubmit={submitTaxes}>
                <label className="settings-field">
                  <span className="field-title">Value Added Tax / Sales Tax Rate (%)</span>
                  <div className="input-with-symbol">
                    <input
                      value={vatRate}
                      onChange={(e) => setVatRate(e.target.value)}
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="20"
                      required
                    />
                    <span className="symbol-addon">%</span>
                  </div>
                  <small className="field-helper">Applied to the bill subtotal plus service charge.</small>
                </label>

                <label className="settings-field">
                  <span className="field-title">Service Charge Rate (%)</span>
                  <div className="input-with-symbol">
                    <input
                      value={serviceChargeRate}
                      onChange={(e) => setServiceChargeRate(e.target.value)}
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="10"
                      required
                    />
                    <span className="symbol-addon">%</span>
                  </div>
                  <small className="field-helper">Discretionary service charge calculated on the food &amp; drinks subtotal.</small>
                </label>

                {taxError && (
                  <div className="alert error">
                    <Icon name="alertTriangle" size={14} /> {taxError}
                  </div>
                )}

                <button className="primary-button settings-save-btn" type="submit" disabled={savingTaxes}>
                  {savingTaxes ? (
                    <>
                      <span className="btn-spinner" /> Saving…
                    </>
                  ) : (
                    <>
                      <Icon name="check" size={15} /> Save Charges
                    </>
                  )}
                </button>
              </form>

              <div className="settings-info-box">
                <Icon name="info" size={18} />
                <p>
                  <strong>Calculation Formula:</strong> Food &amp; Beverage subtotal + Service Charge (
                  {serviceChargeRate || '0'}%) + VAT ({vatRate || '0'}%) = Final Customer Bill.
                </p>
              </div>
            </section>
          )}

          {/* Tab 3: Hardware Printer */}
          {activeTab === 'printer' && (
            <section className="section-card settings-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Hardware Configuration</p>
                  <h2>Counter &amp; Pass Thermal Printer</h2>
                </div>
              </div>

              {/* Discovered Venue Devices & Presets */}
              <div className="printer-preset-section" style={{ marginBottom: 20 }}>
                <span className="field-title" style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 700 }}>
                  Discovered Restaurant Network Devices (1-Tap Select)
                </span>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div
                    onClick={() => selectDevice('192.168.1.117', 9100)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: printerIp === '192.168.1.117' ? '#eff6ff' : '#ffffff',
                      border: `1.5px solid ${printerIp === '192.168.1.117' ? '#2563eb' : '#e2e8f0'}`,
                      borderRadius: 10,
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: printerIp === '192.168.1.117' ? '#2563eb' : '#f1f5f9',
                          color: printerIp === '192.168.1.117' ? '#ffffff' : '#64748b',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name="printer" size={16} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <strong style={{ fontSize: 13, color: '#0f172a' }}>Epson TM-m30II</strong>
                          <span style={{ fontSize: 10, fontWeight: 750, color: '#2563eb', background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>
                            POS Printer (Recommended)
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          IP: <strong>192.168.1.117:9100</strong> · MAC: 64:c6:d2:04:47:41
                        </span>
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '2px 8px', borderRadius: 9999 }}>
                      ● Connected
                    </span>
                  </div>

                  <div
                    onClick={() => selectDevice('192.168.1.162', 9100)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: printerIp === '192.168.1.162' ? '#eff6ff' : '#ffffff',
                      border: `1.5px solid ${printerIp === '192.168.1.162' ? '#2563eb' : '#e2e8f0'}`,
                      borderRadius: 10,
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: printerIp === '192.168.1.162' ? '#2563eb' : '#f1f5f9',
                          color: printerIp === '192.168.1.162' ? '#ffffff' : '#64748b',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name="receipt" size={16} />
                      </div>
                      <div>
                        <strong style={{ fontSize: 13, color: '#0f172a' }}>PRT - RECEIPT</strong>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          IP: <strong>192.168.1.162:9100</strong> · Secondary Pass Printer
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '2px 8px', borderRadius: 9999 }}>
                      ● Connected
                    </span>
                  </div>

                  <div
                    onClick={() => selectDevice('192.168.1.156', 2590)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: printerIp === '192.168.1.156' ? '#eff6ff' : '#ffffff',
                      border: `1.5px solid ${printerIp === '192.168.1.156' ? '#2563eb' : '#e2e8f0'}`,
                      borderRadius: 10,
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: printerIp === '192.168.1.156' ? '#2563eb' : '#f1f5f9',
                          color: printerIp === '192.168.1.156' ? '#ffffff' : '#64748b',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name="grid" size={16} />
                      </div>
                      <div>
                        <strong style={{ fontSize: 13, color: '#0f172a' }}>Kitchen Display System (KDS)</strong>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          IP: <strong>192.168.1.156:2590</strong> · Screen Station
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '2px 8px', borderRadius: 9999 }}>
                      ● Connected
                    </span>
                  </div>
                </div>
              </div>

              <form className="settings-form" onSubmit={submitPrinter}>
                <label className="settings-field">
                  <span className="field-title">Thermal Printer Target IP Address</span>
                  <div className="input-with-symbol">
                    <Icon name="wifi" size={16} className="input-lead-icon" />
                    <input
                      value={printerIp}
                      onChange={(e) => setPrinterIp(e.target.value)}
                      placeholder="e.g. 192.168.1.117"
                    />
                  </div>
                  <small className="field-helper">
                    Local network IP of the Epson POS thermal printer (e.g. 192.168.1.117).
                  </small>
                </label>

                <label className="settings-field">
                  <span className="field-title">ESC/POS Port</span>
                  <input
                    value={printerPort}
                    onChange={(e) => setPrinterPort(e.target.value)}
                    type="number"
                    min="1"
                    max="65535"
                    placeholder="9100"
                    required
                  />
                  <small className="field-helper">Standard RAW ESC/POS thermal printing port is 9100.</small>
                </label>

                {printerError && (
                  <div className="alert error">
                    <Icon name="alertTriangle" size={14} /> {printerError}
                  </div>
                )}

                {testResult && (
                  <div className={`alert ${testResult.success ? 'success' : 'error'}`}>
                    <Icon name={testResult.success ? 'check' : 'alertTriangle'} size={14} /> {testResult.message}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button className="primary-button settings-save-btn" type="submit" disabled={savingPrinter} style={{ flex: 1 }}>
                    {savingPrinter ? (
                      <>
                        <span className="btn-spinner" /> Saving…
                      </>
                    ) : (
                      <>
                        <Icon name="check" size={15} /> Save Printer Config
                      </>
                    )}
                  </button>

                  <button
                    className="secondary-button"
                    type="button"
                    disabled={testingPrinter || !printerIp.trim()}
                    onClick={handleTestPrint}
                    style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    title="Sends a test print ticket directly to this IP address"
                  >
                    {testingPrinter ? (
                      <>
                        <span className="btn-spinner" /> Testing…
                      </>
                    ) : (
                      <>
                        <Icon name="printer" size={15} /> Print Test Ticket
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="settings-info-box" style={{ marginTop: 16 }}>
                <Icon name="printer" size={18} />
                <p>
                  <strong>Direct Thermal Printing:</strong> Orders and bills will stream raw ESC/POS commands directly to <strong>{printerIp || '192.168.1.117'}:{printerPort || '9100'}</strong> over the local WiFi network, bypassing the office photocopy machine.
                </p>
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Live Thermal Receipt Mockup Preview */}
        <aside className="settings-preview-aside">
          <div className="preview-sticky-card">
            <div className="preview-card-header">
              <Icon name="receipt" size={16} />
              <strong>Live Receipt Preview</strong>
              <span className="live-preview-pill">Real-time</span>
            </div>

            {/* Thermal Paper Receipt Simulation (Matches Physical Invoice Format) */}
            <div className="thermal-receipt-mockup">
              <div className="receipt-paper-cut-top" />
              <div className="receipt-paper-body" style={{ fontFamily: '"Courier New", Courier, monospace', fontSize: '11.5px', color: '#000000' }}>
                <div className="receipt-brand-center" style={{ textAlign: 'center', marginBottom: 6 }}>
                  <strong className="receipt-business-name" style={{ fontSize: '14px', display: 'block', textTransform: 'uppercase' }}>
                    {businessName || 'RESTAURANT KAMU - GALLE'}
                  </strong>
                  <span style={{ fontSize: '10px', display: 'block', textTransform: 'uppercase' }}>
                    PREMADASAS LUXURY VILLAS &amp; SPA (PVT) LTD.
                  </span>
                  <span style={{ fontSize: '9.5px', display: 'block', textTransform: 'uppercase' }}>
                    NO: 24, HOSPITAL STREET, GALLE FORT.
                  </span>
                  <span style={{ fontSize: '9.5px', display: 'block', textTransform: 'uppercase' }}>
                    SRI LANKA.
                  </span>
                  <span style={{ fontSize: '9px', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                    TEL : +94 91 2222173 FAX : +94 91 2231973
                  </span>
                </div>

                <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

                <div style={{ textAlign: 'center', fontWeight: 900, fontSize: '13px', letterSpacing: '0.06em' }}>
                  SALES INVOICE
                </div>

                <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', fontWeight: 700 }}>
                  <span>G000030140</span>
                  <span>29-01-2019</span>
                  <span>12:48:52</span>
                </div>

                <div style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>
                    <div style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '11px' }}>CHICKEN OR FRIED NOODLES</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '40px 60px 1fr', fontSize: '11px' }}>
                      <span>1.00</span>
                      <span>750.00</span>
                      <span style={{ textAlign: 'right', fontWeight: 700 }}>750.00</span>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '11px' }}>MIXED FRUIT JUICE</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '40px 60px 1fr', fontSize: '11px' }}>
                      <span>1.00</span>
                      <span>599.99</span>
                      <span style={{ textAlign: 'right', fontWeight: 700 }}>599.99</span>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '11px' }}>WATER BOTTLE 500ML</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '40px 60px 1fr', fontSize: '11px' }}>
                      <span>1.00</span>
                      <span>149.98</span>
                      <span style={{ textAlign: 'right', fontWeight: 700 }}>149.98</span>
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '12px' }}>
                  <span>NET AMOUNT</span>
                  <span>1,499.97</span>
                </div>

                <div style={{ margin: '6px 0', fontSize: '10.5px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>CASH</span>
                    <span>1499.98</span>
                  </div>
                  <div>CHEQUE</div>
                  <div>CREDIT</div>
                  <div>OTHER</div>
                </div>

                <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

                <div style={{ fontSize: '10.5px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>TENDED</span>
                    <span>1499.98</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>BALANCE</span>
                    <span>0.00</span>
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

                <div style={{ fontSize: '10.5px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>* TOTAL DISCOUNT</span>
                    <span>0.00</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>* NUMBER OF ITEM</span>
                    <span>3</span>
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px' }}>
                  <span>TOTAL CREDIT</span>
                  <span>0.00</span>
                </div>

                <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

                <p style={{ textAlign: 'center', fontSize: '11.5px', fontWeight: 800, margin: '8px 0 2px' }}>
                  {footerMessage || 'Thanks and Come again!!!!'}
                </p>
                <p style={{ textAlign: 'center', fontSize: '9.5px', fontWeight: 700, margin: '2px 0 6px' }}>
                  Software By ZIP Flow POS
                </p>

                <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
              </div>
              <div className="receipt-paper-cut-bottom" />
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}

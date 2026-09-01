// Client-side Epson ePOS-Print.
//
// The iPad browser sends the receipt STRAIGHT to the Epson on the shop LAN
// (same Wi-Fi), exactly like Lightspeed does — no cloud->printer hop, no extra
// hardware. The printer already has ePOS-Print enabled (Lightspeed uses it).
//
// Requires: the device viewing this page is on the same network as the printer,
// and the app is served over HTTP (an HTTPS page cannot call an HTTP printer).

import type { Order, OrderRound } from '../features/orders/types'
import type { ReceiptSettings } from '../features/settings/types'

const COLS = 42 // 80mm paper, Font A

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** left text + right text padded to a full line */
function row(left: string, right: string, cols = COLS): string {
  const l = left.length > cols ? left.slice(0, cols) : left
  const gap = Math.max(1, cols - l.length - right.length)
  return l + ' '.repeat(gap) + right
}

function textLine(s: string): string {
  return `<text>${esc(s)}&#10;</text>`
}

/** Build the ePOS-Print body (<epos-print>…</epos-print>) for a bill or round. */
export function buildReceiptEposXml(
  order: Order,
  receipt: ReceiptSettings,
  serverName: string,
  round: OrderRound | null,
): string {
  const lines = round ? round.lines : order.rounds.flatMap((r) => r.lines)
  const total = round ? round.roundTotal : order.total
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0)

  const d = new Date(order.createdAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  const code = `G${String(order.orderNumber).padStart(8, '0')}`

  let b = ''
  b += '<text align="center"/>'
  b += '<text width="2" height="2"/><text em="true"/>'
  b += textLine((receipt.businessName || 'RESTAURANT').toUpperCase())
  b += '<text em="false"/><text width="1" height="1"/>'
  b += textLine('NO: 24, HOSPITAL STREET, GALLE FORT')
  b += textLine('SRI LANKA')
  b += textLine('TEL: +94 91 2222173')
  b += '<text>--------------------------------&#10;</text>'
  b += '<text em="true"/>'
  b += textLine(round ? `KITCHEN PASS - ROUND #${round.roundNumber}` : 'SALES INVOICE')
  b += '<text em="false"/>'
  b += '<text>--------------------------------&#10;</text>'

  // meta
  b += '<text align="left"/>'
  b += textLine(row(code, `${date} ${time}`))
  b += textLine(row(`Table: ${order.tableName}`, `Server: ${serverName}`))
  b += '<text>--------------------------------&#10;</text>'

  // column header
  b += textLine(row('ITEM', 'QTY   PRICE    TOTAL'))
  b += '<text>--------------------------------&#10;</text>'

  // items
  for (const l of lines) {
    b += textLine(l.name.toUpperCase())
    const cols = `${l.quantity.toFixed(2)}  ${l.price.toFixed(2)}  ${l.lineTotal.toFixed(2)}`
    b += textLine(row('', cols))
    if (l.notes) b += textLine(`  * ${l.notes}`)
  }
  b += '<text>--------------------------------&#10;</text>'

  // totals
  b += '<text em="true"/>'
  b += textLine(row('NET AMOUNT', total.toFixed(2)))
  b += '<text em="false"/>'
  b += textLine(row('CASH', total.toFixed(2)))
  b += textLine(row('BALANCE', '0.00'))
  b += textLine(row('NUMBER OF ITEMS', String(itemCount)))
  b += '<text>--------------------------------&#10;</text>'

  // footer
  b += '<text align="center"/>'
  b += textLine(receipt.footerMessage || 'Thanks and come again!')
  b += textLine('Software By ZIP Flow POS')
  b += '<feed line="3"/>'
  b += '<cut type="feed"/>'

  return `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">${b}</epos-print>`
}

/**
 * POST an ePOS-Print document directly to the printer on the LAN.
 * Throws with a useful message if the device can't reach the printer.
 */
export async function printToEpson(ipAddress: string, eposBodyXml: string, port = 80): Promise<void> {
  const scheme = port === 443 ? 'https' : 'http'
  const url = `${scheme}://${ipAddress}${port === 80 || port === 443 ? '' : `:${port}`}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`
  const soap =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
    eposBodyXml +
    '</s:Body></s:Envelope>'

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
      body: soap,
    })
  } catch {
    throw new Error(
      `Couldn't reach the printer at ${ipAddress}. Make sure this device is on the same Wi-Fi as the printer.`,
    )
  }

  const body = await res.text().catch(() => '')
  if (!/success="true"/i.test(body)) {
    const code = body.match(/code="([^"]*)"/i)?.[1]
    throw new Error(code ? `Printer error: ${code}` : `Printer did not confirm the print (HTTP ${res.status}).`)
  }
}

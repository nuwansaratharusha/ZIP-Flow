export function formatMoney(amount: number, symbol: string) {
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

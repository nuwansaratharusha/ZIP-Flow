export function isWaiterOnly(roles: string[] | undefined): boolean {
  return !!roles && roles.length > 0 && roles.every((role) => role === 'WAITER')
}

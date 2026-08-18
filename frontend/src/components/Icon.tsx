import type { SVGProps } from 'react'

export type IconName =
  | 'dashboard'
  | 'home'
  | 'pos'
  | 'orders'
  | 'menu'
  | 'inventory'
  | 'kitchen'
  | 'reports'
  | 'analytics'
  | 'grid'
  | 'settings'
  | 'helpCircle'
  | 'search'
  | 'bell'
  | 'messageSquare'
  | 'plus'
  | 'minus'
  | 'trash'
  | 'chevronDown'
  | 'wifi'
  | 'clock'
  | 'user'
  | 'card'
  | 'cash'
  | 'split'
  | 'close'
  | 'receipt'
  | 'spark'
  | 'tag'
  | 'calendar'
  | 'arrowLeft'
  | 'check'
  | 'star'
  | 'starFilled'
  | 'info'

const outlinePaths: Record<IconName, JSX.Element> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M9 21v-6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6" />
    </>
  ),
  pos: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  orders: (
    <>
      <path d="M6 3h12l2 4v14H4V7l2-4Z" />
      <path d="M4 7h16M8 11h8M8 15h5" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="8" cy="6" r="1.5" fill="currentColor" />
      <circle cx="16" cy="12" r="1.5" fill="currentColor" />
      <circle cx="10" cy="18" r="1.5" fill="currentColor" />
    </>
  ),
  inventory: (
    <>
      <path d="M4 7 12 3l8 4v10l-8 4-8-4V7Z" />
      <path d="m4 7 8 4 8-4M12 11v10" />
    </>
  ),
  kitchen: (
    <>
      <path d="M6 13.8a4 4 0 0 1-2-3.4 4 4 0 0 1 6-3.4A4 4 0 0 1 16 7a4 4 0 0 1 4 3.4 4 4 0 0 1-2 3.4M6 14h12v4a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4Z" />
      <path d="M9 14v4M15 14v4" />
    </>
  ),
  reports: (
    <>
      <path d="M3 20h18" />
      <path d="M6 20v-5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v5M11 20V9a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v11M16 20v-8a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v8" />
    </>
  ),
  analytics: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="m7 14 3.5-4 3 3 3.5-4" />
      <circle cx="17" cy="9" r="1" fill="currentColor" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.3a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2v-4h.4A1.7 1.7 0 0 0 4 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.4 4.1a1.7 1.7 0 0 0 1-.6A1.7 1.7 0 0 0 9.8 2.4V2h4v.4A1.7 1.7 0 0 0 15 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.4c.17.38.38.7.6 1 .3.32.68.5 1.1.5h.4v4h-.4A1.7 1.7 0 0 0 19.4 15Z" />
    </>
  ),
  helpCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  messageSquare: (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: (
    <>
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  wifi: (
    <>
      <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  user: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M7 15h3" />
    </>
  ),
  cash: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  split: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
    </>
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  receipt: (
    <>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4L12 3Z" />
      <path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />
    </>
  ),
  tag: (
    <>
      <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  arrowLeft: <path d="M19 12H5M12 19l-7-7 7-7" />,
  check: <path d="M20 6 9 17l-5-5" />,
  star: (
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  ),
  starFilled: (
    <path
      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
      fill="currentColor"
    />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </>
  ),
}

/* Solid filled variants when active/selected */
const filledPaths: Partial<Record<IconName, JSX.Element>> = {
  home: (
    <path
      d="M12 2.2a1.2 1.2 0 0 0-.77.28l-8 6.5A1.2 1.2 0 0 0 2.8 10v9.5A2.5 2.5 0 0 0 5.3 22h4.2a1 1 0 0 0 1-1v-5.2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V21a1 1 0 0 0 1 1h4.2a2.5 2.5 0 0 0 2.5-2.5V10a1.2 1.2 0 0 0-.43-.92l-8-6.5A1.2 1.2 0 0 0 12 2.2Z"
      fill="currentColor"
    />
  ),
  pos: (
    <path
      d="M4 4a2.5 2.5 0 0 0-2.5 2.5v9A2.5 2.5 0 0 0 4 18h5v2H6.5a1 1 0 1 0 0 2h11a1 1 0 1 0 0-2H15v-2h5a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 20 4H4Zm0 2h16a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-8A.5.5 0 0 1 4 6Z"
      fill="currentColor"
    />
  ),
  orders: (
    <path
      d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 3.2 1.6l2.8-2.1 2.8 2.1a1 1 0 0 0 1.2 0l2.8-2.1 2.8 2.1a2 2 0 0 0 3.2-1.6V5a2 2 0 0 0-2-2H5Zm2 5a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Zm0 4a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Zm0 4a1 1 0 0 1 1-1h5a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Z"
      fill="currentColor"
    />
  ),
  menu: (
    <path
      d="M3 6a1.2 1.2 0 0 1 1.2-1.2h3.6a2.8 2.8 0 0 1 5.4 0h6.6a1.2 1.2 0 1 1 0 2.4h-6.6a2.8 2.8 0 0 1-5.4 0H4.2A1.2 1.2 0 0 1 3 6Zm0 6a1.2 1.2 0 0 1 1.2-1.2h10.6a2.8 2.8 0 0 1 5.4 0h-.6a1.2 1.2 0 1 1 0 2.4h.6a2.8 2.8 0 0 1-5.4 0H4.2A1.2 1.2 0 0 1 3 12Zm0 6a1.2 1.2 0 0 1 1.2-1.2h5.6a2.8 2.8 0 0 1 5.4 0h4.6a1.2 1.2 0 1 1 0 2.4h-4.6a2.8 2.8 0 0 1-5.4 0H4.2A1.2 1.2 0 0 1 3 18Z"
      fill="currentColor"
    />
  ),
  inventory: (
    <path
      d="M12.8 2.2a1.8 1.8 0 0 0-1.6 0l-7 3.5A2 2 0 0 0 3 7.5v9a2 2 0 0 0 1.2 1.8l7 3.5a1.8 1.8 0 0 0 1.6 0l7-3.5A2 2 0 0 0 21 16.5v-9a2 2 0 0 0-1.2-1.8l-7-3.5ZM12 4.3 18.2 7.4 12 10.5 5.8 7.4 12 4.3ZM4.8 9.3l6.2 3.1v7.2l-6.2-3.1V9.3Zm8.4 10.3v-7.2l6.2-3.1v7.2l-6.2 3.1Z"
      fill="currentColor"
    />
  ),
  kitchen: (
    <path
      d="M6 13.8a4 4 0 0 1-2-3.4 4 4 0 0 1 6-3.4A4 4 0 0 1 16 7a4 4 0 0 1 4 3.4 4 4 0 0 1-2 3.4M6 14h12v4a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4Z"
      fill="currentColor"
    />
  ),
  reports: (
    <path
      d="M2 19a1 1 0 0 1 1-1h18a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1ZM5 14a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4H5v-4Zm5-6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v10h-4V8Zm5 3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7h-4v-7Z"
      fill="currentColor"
    />
  ),
  settings: (
    <path
      d="M12 1a2 2 0 0 1 1.95 1.57l.32 1.34a8.1 8.1 0 0 1 1.92 1.11l1.34-.37a2 2 0 0 1 2.37.98l1.5 2.6a2 2 0 0 1-.45 2.53l-1.07.88a8.3 8.3 0 0 1 0 2.22l1.07.88a2 2 0 0 1 .45 2.53l-1.5 2.6a2 2 0 0 1-2.37.98l-1.34-.37a8.1 8.1 0 0 1-1.92 1.11l-.32 1.34A2 2 0 0 1 12 23h-3a2 2 0 0 1-1.95-1.57l-.32-1.34a8.1 8.1 0 0 1-1.92-1.11l-1.34.37a2 2 0 0 1-2.37-.98l-1.5-2.6a2 2 0 0 1 .45-2.53l1.07-.88a8.3 8.3 0 0 1 0-2.22l-1.07-.88a2 2 0 0 1-.45-2.53l1.5-2.6a2 2 0 0 1 2.37-.98l1.34.37a8.1 8.1 0 0 1 1.92-1.11l.32-1.34A2 2 0 0 1 9 1h3Zm-1.5 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
      fill="currentColor"
    />
  ),
  helpCircle: (
    <path
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm1 15h-2v-2h2v2Zm1.07-7.75-.9.92C12.45 10.9 12 11.5 12 13h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 .88-.36 1.68-.93 2.25Z"
      fill="currentColor"
    />
  ),
}

export function Icon({
  name,
  size = 20,
  filled = false,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number; filled?: boolean }) {
  const content = filled && filledPaths[name] ? filledPaths[name] : outlinePaths[name]
  const isFilled = filled && Boolean(filledPaths[name])

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={isFilled ? 'currentColor' : 'none'}
      stroke={isFilled ? 'none' : 'currentColor'}
      strokeWidth={isFilled ? '0' : '1.8'}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {content}
    </svg>
  )
}

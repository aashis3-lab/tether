// Small outline icon set matching the /designs frames (1.75px strokes, round caps).
import type { SVGProps } from 'react'

function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  )
}

export const PinIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Svg>
)

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z" />
  </Svg>
)

export const UsersIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.1.7 3.5 2.8 3.5 5.7" />
  </Svg>
)

export const ScanIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />
  </Svg>
)

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
)

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const GearIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Svg>
)

export const XIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const ArrowLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
)

export const ChevronLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m15 6-6 6 6 6" />
  </Svg>
)

export const ChevronRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
)

export const UserIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </Svg>
)

export const ShieldIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
  </Svg>
)

export const BellIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2ZM10 21h4" />
  </Svg>
)

export const AlertTriangleIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M12 2.5 1.5 21h21L12 2.5Z" fill="currentColor" />
    <path d="M12 9v5.5" stroke="#e01414" strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="12" cy="17.6" r="1.4" fill="#e01414" />
  </svg>
)

export const CheersIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m4.5 4 5 1.3-1 5.2a2.6 2.6 0 0 1-5-1.3L4.5 4ZM19.5 4l-5 1.3 1 5.2a2.6 2.6 0 0 0 5-1.3L19.5 4ZM6 11.3 5 20M18 11.3 19 20M3 20h4M17 20h4" />
  </Svg>
)

export const ClockIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
)

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
)

export const CheckCircleIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.8 2.8L16 10" />
  </Svg>
)

export const SendIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" />
  </Svg>
)

export const PhoneIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </Svg>
)

export const ShieldAlertIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
    <path d="M12 8v4.5M12 15.5v.5" />
  </Svg>
)

export const DoorIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M14 12h.01" />
  </Svg>
)

export const WalkIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="13" cy="4" r="2" />
    <path d="m9 21 2.5-6.5L14 17v4M7 12l2.5-4.5L13 8l2.5 4 3 1M11.5 14.5 13 8" />
  </Svg>
)

export const ChatIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 1 3.3 6.5L3 20l1.4-4A8 8 0 0 1 4 12Z" />
  </Svg>
)

export const CarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5 16V11l2-5h10l2 5v5M3 16h18v3h-3v-1H6v1H3v-3ZM5 11h14" />
    <circle cx="7.5" cy="13.5" r=".5" />
    <circle cx="16.5" cy="13.5" r=".5" />
  </Svg>
)

export const HandIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v7M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L2.8 15a1.6 1.6 0 0 1 2.6-1.8L8 15.5" />
  </Svg>
)

export const BatteryIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="2" y="7" width="17" height="10" rx="2" />
    <path d="M22 11v2M5 10v4" />
  </Svg>
)

export const BluetoothIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m7 7 10 10-5 4V3l5 4L7 17" />
  </Svg>
)

export const VolumeXIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 9h3l5-4v14l-5-4H4V9ZM16 9l5 6M21 9l-5 6" />
  </Svg>
)

export const SirenIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M7 18v-6a5 5 0 0 1 10 0v6M5 21h14v-3H5v3ZM12 3v2M4.2 6.2l1.4 1.4M19.8 6.2l-1.4 1.4" />
  </Svg>
)

export const QrIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
    <rect x="8" y="8" width="8" height="8" rx="1" />
  </Svg>
)

export const CalendarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
)

export const CocktailIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5 4h14l-7 8-7-8ZM12 12v8M8 20h8M16 4l2-2" />
  </Svg>
)

export const BeerIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M6 7h10v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7ZM16 10h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M6 7a3 3 0 0 1 5-2.2A3 3 0 0 1 16 7M9.5 11v6M12.5 11v6" />
  </Svg>
)

export const MusicIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M9 18V6l11-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </Svg>
)

export const ForkKnifeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-1.7 0-3 2-3 5s1.3 4 3 4v9" />
  </Svg>
)

export const CrosshairIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Svg>
)

export const MapPickIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14" />
  </Svg>
)

export const UserCheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3 20c0-3.6 2.9-6 6.5-6 1.7 0 3.2.5 4.3 1.4M15.5 17.5l2 2 4-4.5" />
  </Svg>
)

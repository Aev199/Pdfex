import { DEFAULT_SIZE, DEFAULT_STROKE_WIDTH, type IconProps } from './icon-base'

export { BoltIcon, GitHubIcon, SendIcon, TapeIcon } from './icons-solid'

function Icon({
  size = DEFAULT_SIZE,
  strokeWidth = DEFAULT_STROKE_WIDTH,
  children
}: IconProps & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export function ChevronUpIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m18 15-6-6-6 6" />
    </Icon>
  )
}

export function ArrowUpIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </Icon>
  )
}

export function ChevronDownIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  )
}

export function ChevronLeftIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  )
}

export function ChevronRightIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  )
}

export function PlusIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  )
}

export function MinusIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
    </Icon>
  )
}

export function SearchIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  )
}

export function HighlighterIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m9 11-6 6v3h9l3-3" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </Icon>
  )
}

export function ImportArrowIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </Icon>
  )
}

export function GearIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

export function HelpIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </Icon>
  )
}

export function DownloadIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </Icon>
  )
}

export function CommentIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Icon>
  )
}

export function EyeIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

export function EyeOffIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M9.9 4.24A9 9 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.16 3.19" />
      <path d="M6.6 6.6C3.6 8.6 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </Icon>
  )
}

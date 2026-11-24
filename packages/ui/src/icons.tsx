import type { SVGProps } from "react";

/**
 * Inline icon set. Bundling SVG paths avoids an icon dependency and keeps the
 * bundle small on the low-end Android devices this product targets.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (props: IconProps) => (
  <Svg {...props} fill="currentColor" stroke="none">
    <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
  </Svg>
);

export const PauseIcon = (props: IconProps) => (
  <Svg {...props} fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4" height="14" rx="1.2" />
    <rect x="14" y="5" width="4" height="14" rx="1.2" />
  </Svg>
);

export const SkipBackIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M18 5.5v13L9 12l9-6.5Z" fill="currentColor" stroke="none" />
    <path d="M6 5v14" />
  </Svg>
);

export const SkipForwardIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 5.5v13L15 12 6 5.5Z" fill="currentColor" stroke="none" />
    <path d="M18 5v14" />
  </Svg>
);

export const RewindIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <text x="12" y="15.5" textAnchor="middle" fontSize="7" stroke="none" fill="currentColor">
      15
    </text>
  </Svg>
);

export const ForwardIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v5h-5" />
    <text x="12" y="15.5" textAnchor="middle" fontSize="7" stroke="none" fill="currentColor">
      15
    </text>
  </Svg>
);

export const HeartIcon = ({ filled = false, ...props }: IconProps & { filled?: boolean }) => (
  <Svg {...props} fill={filled ? "currentColor" : "none"}>
    <path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7 3.1c0 4.9-7 9.3-7 9.3Z" />
  </Svg>
);

export const PlusIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const CheckIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m5 13 4.5 4.5L19 7" />
  </Svg>
);

export const SearchIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Svg>
);

export const HomeIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" />
  </Svg>
);

export const RadioIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="2.4" />
    <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
  </Svg>
);

export const PodcastIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="9" y="3" width="6" height="10" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Svg>
);

export const VideoIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="6" width="12" height="12" rx="2.5" />
    <path d="m15 12 6-3.5v7L15 12Z" />
  </Svg>
);

export const LibraryIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 4v16M9.5 4v16M14 5.5l4.8 14" />
  </Svg>
);

export const QueueIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 7h11M4 12h11M4 17h7" />
    <path d="m16.5 14.5 4 2.5-4 2.5v-5Z" fill="currentColor" stroke="none" />
  </Svg>
);

export const VolumeIcon = ({ muted = false, ...props }: IconProps & { muted?: boolean }) => (
  <Svg {...props}>
    <path d="M4 9.5h3l4.5-3.5v12L7 14.5H4Z" />
    {muted ? <path d="m16 9.5 4 5M20 9.5l-4 5" /> : <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />}
  </Svg>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m14 6-6 6 6 6" />
  </Svg>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m10 6 6 6-6 6" />
  </Svg>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m6 10 6 6 6-6" />
  </Svg>
);

export const ChevronUpIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m6 14 6-6 6 6" />
  </Svg>
);

export const CloseIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);

export const MenuIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const AlertIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 4.5 21 20H3L12 4.5Z" />
    <path d="M12 10v4.5M12 17.2v.3" />
  </Svg>
);

/** Medical Chronicles: a stethoscope-like loop. */
export const MedicalIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 3v5a4 4 0 0 0 8 0V3" />
    <path d="M10 12v2a5 5 0 0 0 10 0v-1" />
    <circle cx="20" cy="11" r="2" />
  </Svg>
);

export const UserIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);

export const StarIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z" />
  </Svg>
);

export const LockIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);

export const ExternalIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
);

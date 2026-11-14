import { ReactNode, SVGProps } from 'react';

/**
 * The app's icon set (audit M10): SVG in the bottom nav's line style, in place of emoji and text
 * glyphs (▶ ← × ⑂ 📍 …), which draw differently on every font and OS.
 *
 * Every icon is decorative by default (`aria-hidden`), so the button or text beside it names it:
 * `<button aria-label="Close"><CloseIcon /></button>`. Pass `title` to make one an image with a
 * name instead. It takes the text colour (`currentColor`) and is 20px unless `size` says.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
    /** Width and height in px; 20 by default. */
    size?: number;
    /** Names the icon for assistive tech (role="img"); without it the icon is hidden from them. */
    title?: string;
}

function icon(name: string, paths: ReactNode, { filled = false }: { filled?: boolean } = {}) {
    function Icon({ size = 20, title, ...rest }: IconProps) {
        return (
            <svg
                viewBox="0 0 24 24"
                width={size}
                height={size}
                fill={filled ? 'currentColor' : 'none'}
                stroke={filled ? 'none' : 'currentColor'}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                focusable="false"
                {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
                {...rest}
            >
                {paths}
            </svg>
        );
    }
    Icon.displayName = name;
    return Icon;
}

/** ▶ Play, Continue. */
export const PlayIcon = icon('PlayIcon', <path d="M8 5.5v13l10.5-6.5z" />, { filled: true });
/** ❚❚ Pause. */
export const PauseIcon = icon(
    'PauseIcon',
    <>
        <rect x="6.5" y="5" width="4" height="14" rx="1" />
        <rect x="13.5" y="5" width="4" height="14" rx="1" />
    </>,
    { filled: true },
);
/** ■ Stop. */
export const StopIcon = icon('StopIcon', <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />, { filled: true });

/** ← Back. */
export const ArrowLeftIcon = icon('ArrowLeftIcon', <path d="M19 12H5M11 6l-6 6 6 6" />);
/** → Forward, next. */
export const ArrowRightIcon = icon('ArrowRightIcon', <path d="M5 12h14M13 6l6 6-6 6" />);
/** ↑ Move up. */
export const ArrowUpIcon = icon('ArrowUpIcon', <path d="M12 19V5M6 11l6-6 6 6" />);
/** ↓ Move down. */
export const ArrowDownIcon = icon('ArrowDownIcon', <path d="M12 5v14M6 13l6 6 6-6" />);

/** ‹ Previous. */
export const ChevronLeftIcon = icon('ChevronLeftIcon', <path d="M15 6l-6 6 6 6" />);
/** › Next. */
export const ChevronRightIcon = icon('ChevronRightIcon', <path d="M9 6l6 6-6 6" />);
/** The fold chevron: points down while folded. */
export const ChevronDownIcon = icon('ChevronDownIcon', <path d="M6 9l6 6 6-6" />);

/** × Close, remove. */
export const CloseIcon = icon('CloseIcon', <path d="M6 6l12 12M18 6L6 18" />);
/** ✎ Edit. */
export const PencilIcon = icon('PencilIcon', <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4" />);
/** ↺ Reset, regenerate, undo. */
export const UndoIcon = icon('UndoIcon', <path d="M4 5v5h5M4.6 14.5A8 8 0 1 0 6.3 6.3L4 10" />);
/** ⑂ Branch. */
export const BranchIcon = icon(
    'BranchIcon',
    <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="7" r="2" />
        <path d="M6 7v10M18 9c0 5-6 4-11.2 8.5" />
    </>,
);
/** ⋯ More. */
export const MoreIcon = icon(
    'MoreIcon',
    <>
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
    </>,
    { filled: true },
);
/** ✨ The AI: rewrite, the Story assistant. */
export const SparkleIcon = icon(
    'SparkleIcon',
    <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2zm7 12l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14zM5 15l.7 1.8 1.8.7-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7L5 15z" />,
    { filled: true },
);

/**
 * The Story assistant: a speech bubble with a small sparkle, so it is not taken for a field's
 * Rewrite, which is the sparkle alone (audit Low, Editor).
 */
export const AssistantIcon = icon(
    'AssistantIcon',
    <>
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" />
        <path d="M12 7.2l.75 1.8 1.8.75-1.8.75L12 12.3l-.75-1.8-1.8-.75 1.8-.75z" fill="currentColor" stroke="none" />
    </>,
);

/** 📍 Where: the current Scene. */
export const PinIcon = icon(
    'PinIcon',
    <>
        <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
        <circle cx="12" cy="10" r="2.3" />
    </>,
);
/** 🎯 A goal. */
export const TargetIcon = icon(
    'TargetIcon',
    <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </>,
);

// The Story clock's times of day (spec: "Story clock"): 🌅 🌤️ ☀️ 🌇 🌆 🌙.
const SUN_RAYS = 'M12 2.5v2M4.6 5.6l1.4 1.4M19.4 5.6L18 7M2.5 13h2M19.5 13h2';

/** 🌅 Dawn: the sun coming up over the line. */
export const DawnIcon = icon(
    'DawnIcon',
    <>
        <path d="M7.5 17a4.5 4.5 0 0 1 9 0" />
        <path d={SUN_RAYS} />
        <path d="M3 17h18M9 20.5h6M12 11.5V8.5M10.5 10l1.5-1.5 1.5 1.5" />
    </>,
);
/** 🌤️ Morning: the sun with a cloud. */
export const MorningIcon = icon(
    'MorningIcon',
    <>
        <circle cx="9" cy="9" r="3.5" />
        <path d="M9 2.5v1.5M3.5 9H2M4.4 4.4l1 1M13.6 4.4l-1 1" />
        <path d="M8.5 19.5h9a3.5 3.5 0 0 0 0-7 4.5 4.5 0 0 0-8.6 1.5A2.8 2.8 0 0 0 8.5 19.5z" />
    </>,
);
/** ☀️ Noon: the full sun. */
export const NoonIcon = icon(
    'NoonIcon',
    <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>,
);
/** 🌇 Afternoon: the sun low over the town. */
export const AfternoonIcon = icon(
    'AfternoonIcon',
    <>
        <circle cx="15" cy="9" r="3.5" />
        <path d="M15 2.5v1.5M21.5 9H20M19.6 4.4l-1 1" />
        <path d="M3 21v-7h4v7M7 21v-4h4v4M11 21v-6h3v6M2 21h20" />
    </>,
);
/** 🌆 Evening: the sun going down under the line. */
export const EveningIcon = icon(
    'EveningIcon',
    <>
        <path d="M7.5 17a4.5 4.5 0 0 1 9 0" />
        <path d={SUN_RAYS} />
        <path d="M3 17h18M9 20.5h6M12 8.5v3M10.5 10l1.5 1.5 1.5-1.5" />
    </>,
);
/** 🌙 Night: the moon. */
export const NightIcon = icon('NightIcon', <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />);

/** 📷 Snapshot: a camera. */
export const CameraIcon = icon(
    'CameraIcon',
    <>
        <path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" />
        <circle cx="12" cy="13" r="3.5" />
    </>,
);
/** 🔒 Locked: a padlock. */
export const LockIcon = icon(
    'LockIcon',
    <>
        <rect x="5" y="11" width="14" height="9.5" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>,
);

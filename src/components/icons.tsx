interface IconProps {
    className?: string;
}

export function IconChevronRight({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.8"
        >
            <path d="M5 3 L9 7 L5 11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconChevronDown({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.8"
        >
            <path d="M3 5 L7 9 L11 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconArrowUp({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.8"
        >
            <path d="M7 12 V3 M3 7 L7 3 L11 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconArrowDown({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.8"
        >
            <path d="M7 2 V11 M3 7 L7 11 L11 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconCopy({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.5"
        >
            <rect x="5" y="5" width="8" height="8" rx="1" />
            <path d="M9 5 V3 a1 1 0 0 0 -1 -1 H2 a1 1 0 0 0 -1 1 V9 a1 1 0 0 0 1 1 H5" />
        </svg>
    );
}

export function IconTrash({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.5"
        >
            <path d="M2 4 H12 M5 4 V3 a1 1 0 0 1 1 -1 H8 a1 1 0 0 1 1 1 V4 M3 4 L3.8 12 a1 1 0 0 0 1 1 H9.2 a1 1 0 0 0 1 -1 L11 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconMore({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14" height="14" viewBox="0 0 14 14"
            fill="currentColor"
        >
            <circle cx="3" cy="7" r="1.3" />
            <circle cx="7" cy="7" r="1.3" />
            <circle cx="11" cy="7" r="1.3" />
        </svg>
    );
}

export function IconPlus({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="12" height="12" viewBox="0 0 12 12"
            fill="none" stroke="currentColor" strokeWidth="1.8"
        >
            <path d="M6 2 V10 M2 6 H10" strokeLinecap="round" />
        </svg>
    );
}

export function IconCheck({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="2"
        >
            <path d="M2 7 L5.5 10.5 L12 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconDownload({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.8"
        >
            <path d="M7 2 V9 M3 6 L7 10 L11 6 M2 12 H12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconHelp({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.6"
        >
            <circle cx="7" cy="7" r="5.5" />
            <path d="M5.2 5.5 a1.8 1.8 0 1 1 2.3 1.7 c-.5.2 -.5.5 -.5 1" strokeLinecap="round" />
            <circle cx="7" cy="10" r="0.7" fill="currentColor" />
        </svg>
    );
}

export function IconUndo({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.8"
        >
            <path d="M4 6 L2 4 L4 2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 4 H8 a4 4 0 0 1 0 8 H6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconRedo({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.8"
        >
            <path d="M10 6 L12 4 L10 2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 4 H6 a4 4 0 0 0 0 8 H8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconTarget({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.6"
        >
            <circle cx="7" cy="7" r="4" />
            <circle cx="7" cy="7" r="1.2" fill="currentColor" />
            <path d="M7 1 V3 M7 11 V13 M1 7 H3 M11 7 H13" strokeLinecap="round" />
        </svg>
    );
}

export function IconFileText({ className }: IconProps) {
    return (
        <svg className={className} width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M3 1.5 H8 L11 4.5 V12 a0.5 0.5 0 0 1 -0.5 0.5 H3 a0.5 0.5 0 0 1 -0.5 -0.5 V2 a0.5 0.5 0 0 1 0.5 -0.5 Z" strokeLinejoin="round" />
            <path d="M8 1.5 V4.5 H11" strokeLinejoin="round" />
            <path d="M4.5 7.5 H8.5 M4.5 9.5 H8.5" strokeLinecap="round" />
        </svg>
    );
}

export function IconFolder({ className }: IconProps) {
    return (
        <svg className={className} width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M1.5 3.5 a0.8 0.8 0 0 1 0.8 -0.8 H5.2 L6.4 4 H11.7 a0.8 0.8 0 0 1 0.8 0.8 V10.5 a0.8 0.8 0 0 1 -0.8 0.8 H2.3 a0.8 0.8 0 0 1 -0.8 -0.8 Z" strokeLinejoin="round" />
        </svg>
    );
}

export function IconGrid({ className }: IconProps) {
    return (
        <svg className={className} width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="1.5" y="1.5" width="11" height="11" rx="1" />
            <path d="M1.5 5 H12.5 M1.5 9 H12.5 M5 1.5 V12.5 M9 1.5 V12.5" />
        </svg>
    );
}

export function IconPlus2({ className }: IconProps) {
    return (
        <svg className={className} width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M7 3 V11 M3 7 H11" strokeLinecap="round" />
        </svg>
    );
}

export function IconX({ className }: IconProps) {
    return (
        <svg className={className} width="12" height="12" viewBox="0 0 12 12"
            fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 3 L9 9 M9 3 L3 9" strokeLinecap="round" />
        </svg>
    );
}

export function IconLink({ className }: IconProps) {
    return (
        <svg className={className} width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M5.5 8.5 L8.5 5.5" strokeLinecap="round" />
            <path d="M7 3.5 L8.5 2 a2 2 0 1 1 3.5 3.5 L10.5 7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 10.5 L5.5 12 a2 2 0 0 1 -3.5 -3.5 L3.5 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconShield({ className }: IconProps) {
    return (
        <svg className={className} width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M7 1.5 L12 3 V7 c0 3 -2.5 5.5 -5 6 -2.5 -.5 -5 -3 -5 -6 V3 Z"
                strokeLinejoin="round" />
            <path d="M5 7 L6.5 8.5 L9.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconSearch({ className }: IconProps) {
    return (
        <svg className={className} width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6" cy="6" r="4" />
            <path d="M9 9 L12.5 12.5" strokeLinecap="round" />
        </svg>
    );
}

export function IconSave({ className }: IconProps) {
    return (
        <svg className={className} width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 2 H10 L12 4 V12 H2 Z" strokeLinejoin="round" />
            <path d="M4 2 V5 H9 V2" strokeLinejoin="round" />
            <rect x="4" y="8" width="6" height="4" />
        </svg>
    );
}

export function IconSparkles({ className }: IconProps) {
    return (
        <svg className={className} width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M7 1 L8 5 L12 6 L8 7 L7 11 L6 7 L2 6 L6 5 Z"
                strokeLinejoin="round" />
            <path d="M11 9 L11.5 10.5 L13 11 L11.5 11.5 L11 13 L10.5 11.5 L9 11 L10.5 10.5 Z"
                strokeLinejoin="round" />
        </svg>
    );
}

export function IconRefresh({ className }: IconProps) {
    return (
        <svg
            className={className}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {/* Верхняя дуга от 9 часов до 3 часов против часовой */}
            <path d="M2.5 6 A4.5 4.5 0 0 1 11.5 6" />
            {/* Стрелка вниз-влево на конце верхней дуги */}
            <path d="M11.5 2.5 V6 H8" />
            {/* Нижняя дуга от 3 часов до 9 часов по часовой */}
            <path d="M11.5 8 A4.5 4.5 0 0 1 2.5 8" />
            {/* Стрелка вверх-вправо на конце нижней дуги */}
            <path d="M2.5 11.5 V8 H6" />
        </svg>
    );
}

export function IconLayoutHorizontal({ className }: IconProps) {
    return (
        <svg className={className} width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="1.5" y="4.5" width="4" height="5" rx="0.5" />
            <rect x="8.5" y="4.5" width="4" height="5" rx="0.5" />
            <path d="M5.5 7 H8.5" strokeLinecap="round" />
        </svg>
    );
}

export function IconLayoutVertical({ className }: IconProps) {
    return (
        <svg className={className} width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="4.5" y="1.5" width="5" height="4" rx="0.5" />
            <rect x="4.5" y="8.5" width="5" height="4" rx="0.5" />
            <path d="M7 5.5 V8.5" strokeLinecap="round" />
        </svg>
    );
}

export function IconGroupFrame({ className }: IconProps) {
    return (
        <svg className={className} width="14" height="14" viewBox="0 0 14 14"
            fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="1.5" y="1.5" width="11" height="11" rx="1.5"
                strokeDasharray="2 1.5" />
            <rect x="3.5" y="3.5" width="3" height="3" rx="0.4" />
            <rect x="7.5" y="3.5" width="3" height="3" rx="0.4" />
            <rect x="3.5" y="7.5" width="3" height="3" rx="0.4" />
            <rect x="7.5" y="7.5" width="3" height="3" rx="0.4" />
        </svg>
    );
}

const ICONS = {
  plate: (
    <>
      <path d="M4 13a8 8 0 0 1 16 0Z" />
      <path d="M2 13h20" />
      <path d="M9.2 7c0-1.4 1.1-1.6 1.1-3M13.7 7c0-1.4 1.1-1.6 1.1-3" />
      <path d="M7 16.5h10" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2L9 4.8h6l1.5 2.2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" />
      <circle cx="12" cy="12.6" r="3.4" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 17 4.5-4.5 3 3L16 12l3 3.5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v2.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  arrowRight: <path d="M4 12h15m-6-6 6 6-6 6" />,
  arrowLeft: <path d="M20 12H5m6-6-6 6 6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  flame: (
    <path d="M12 21.5c3.9 0 6.5-2.7 6.5-6.3 0-2.8-1.8-5-3.2-6.6C13.9 7 13 5.4 13 3.6c-2.8 1.8-3.8 4.2-3.8 6.1 0 1.4.4 2.3.9 3.1-1.4-.4-2.3-1.4-2.8-2.8C5.9 11.4 5.5 13 5.5 14.9c0 3.9 2.6 6.6 6.5 6.6Z" />
  ),
  basket: (
    <>
      <path d="M5 9h14l-1.6 9.4a2 2 0 0 1-2 1.6H8.6a2 2 0 0 1-2-1.6Z" />
      <path d="m8.5 9 3.5-5 3.5 5" />
    </>
  ),
  pen: <path d="m14.5 5 4.5 4.5L8 18.5l-5 1 1-5Z" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 3.5V8h-4.5" />
    </>
  ),
  warn: (
    <>
      <path d="M12 4 3 20h18Z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.4v.01" />
    </>
  ),
  spark: <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.8 2.8m5.8 5.8 2.8 2.8m0-11.4-2.8 2.8m-5.8 5.8-2.8 2.8" />,
};

export default function Icon({ name, size = 20, strokeWidth = 1.7, className = "" }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name] || null}
    </svg>
  );
}

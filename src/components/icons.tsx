export type IconType =
  | "arrow"
  | "map"
  | "flag"
  | "capital"
  | "language"
  | "lock"
  | "cross"
  | "settings"
  | "collection"
  | "achievements"
  | "progress";

export function Icon({ type }: { type: IconType }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {type === "arrow" && <path d="M5 12h13m-5-5 5 5-5 5" />}
      {type === "map" && (
        <>
          <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
          <path d="M9 3v15m6-12v15" />
        </>
      )}
      {type === "flag" && (
        <path d="M5 21V4m0 1c6-4 8 4 14 0v9c-6 4-8-4-14 0" />
      )}
      {type === "capital" && (
        <>
          <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </>
      )}
      {type === "language" && <><path d="M4 5h9v10H8l-4 4V5Z" /><path d="M8 9h5m-2-3v3c0 2-1 4-3 5m3-2 2 2m3-6h4m-2-2v2c0 4-1 7-4 9m3-4 3 4" /></>}
      {type === "lock" && (
        <>
          <rect x="5" y="10" width="14" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      )}
      {type === "cross" && <path d="M12 3v18M3 12h18" />}
      {type === "settings" && <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.1h-2.6v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.5-1H6v-2.6h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L9 6.6l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.1h2.6v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1V14h-.1a1.7 1.7 0 0 0-1.1 1Z" /></>}
      {type === "collection" && <><path d="M5 5h11a2 2 0 0 1 2 2v12H7a2 2 0 0 1-2-2V5Z" /><path d="M8 2h11a2 2 0 0 1 2 2v12M8 9h7M8 13h7" /></>}
      {type === "achievements" && <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 13v5m-4 3h8" /></>}
      {type === "progress" && <><path d="M5 20V10h4v10M10 20V4h4v16m1 0v-7h4v7" /></>}
    </svg>
  );
}
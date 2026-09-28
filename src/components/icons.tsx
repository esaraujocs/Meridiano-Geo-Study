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
  | "progress"
  | "repeat"
  | "sliders"
  | "home"
  | "puzzle"
  | "trend"
  | "flame"
  | "chevron"
  | "clock"
  | "eye"
  | "type"
  | "route"
  | "layers"
  | "stopwatch"
  | "book"
  | "store"
  | "star"
  | "swords"
  | "info"
  | "search"
  | "compass"
  | "hourglass";

export function Icon({ type, size = 18 }: { type: IconType; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
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
      {type === "settings" && <><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37 1 .608 2.296.07 2.572-1.065Z" /><circle cx="12" cy="12" r="3" /></>}
      {type === "collection" && <><path d="M5 5h11a2 2 0 0 1 2 2v12H7a2 2 0 0 1-2-2V5Z" /><path d="M8 2h11a2 2 0 0 1 2 2v12M8 9h7M8 13h7" /></>}
      {type === "achievements" && <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 13v5m-4 3h8" /></>}
      {type === "progress" && <><path d="M5 20V10h4v10M10 20V4h4v16m1 0v-7h4v7" /></>}
      {type === "repeat" && <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>}
      {type === "sliders" && <><path d="M4 7h9m4 0h3M4 12h2m4 0h10M4 17h9m4 0h3" /><circle cx="15" cy="7" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="15" cy="17" r="2" /></>}
      {type === "home" && <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>}
      {type === "puzzle" && <path d="M19.4 7.9c-.05.32.06.65.29.88l1.57 1.57a2.4 2.4 0 0 1 0 3.4l-1.61 1.61a.98.98 0 0 1-.84.28c-.47-.07-.8-.48-.97-.93a2.5 2.5 0 1 0-3.2 3.2c.44.17.85.5.92.97a.98.98 0 0 1-.27.84l-1.61 1.61a2.4 2.4 0 0 1-3.4 0l-1.57-1.57a1.03 1.03 0 0 0-.88-.29c-.49.07-.84.5-1.02.97a2.5 2.5 0 1 1-3.24-3.24c.47-.18.9-.53.97-1.02a1.03 1.03 0 0 0-.29-.88l-1.57-1.57a2.4 2.4 0 0 1 0-3.4l1.53-1.53c.24-.24.58-.35.92-.3.51.08.88.53 1.07 1.01a2.5 2.5 0 1 0 3.26-3.26c-.48-.2-.93-.56-1.01-1.07a1.03 1.03 0 0 1 .3-.92l1.52-1.53a2.4 2.4 0 0 1 3.4 0l1.57 1.57c.23.23.56.34.88.29.49-.07.84-.5 1.02-.97a2.5 2.5 0 1 1 3.24 3.24c-.47.18-.9.53-.97 1.02Z" />}
      {type === "trend" && <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>}
      {type === "flame" && <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z" />}
      {type === "chevron" && <path d="m6 9 6 6 6-6" />}
      {type === "clock" && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
      {type === "eye" && <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}
      {type === "type" && <path d="M4 7V5h16v2M9 19h6M12 5v14" />}
      {type === "route" && <><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></>}
      {type === "layers" && <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /><path d="m3 17.5 9 5 9-5" /></>}
      {type === "stopwatch" && <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6M12 2v3" /></>}
      {type === "store" && <><path d="M6 8h12l1.2 12.5H4.8L6 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /><path d="M9.5 12.5a2.5 2.5 0 0 0 5 0" /></>}
      {type === "star" && <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" />}
      {type === "swords" && <path d="M4 4l7 7m-3 0 3 3M4 20l3-3m-1-1 3 3m11-15-7 7m3 0-3 3m7 4-3-3m1-1-3 3" />}
      {type === "info" && <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>}
      {type === "book" && <><path d="M2 5.5C4.5 4 8 4 12 6c4-2 7.5-2 10-.5v13c-2.5-1.5-6-1.5-10 .5-4-2-7.5-2-10-.5v-13Z" /><path d="M12 6v13" /></>}
      {type === "search" && <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>}
      {type === "compass" && <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.3 5.3-5.3 2.3 2.3-5.3 5.3-2.3Z" /></>}
      {type === "hourglass" && <><path d="M6 2h12M6 22h12" /><path d="M7 2c0 5 4 6 5 8-1 2-5 3-5 8h10c0-5-4-6-5-8 1-2 5-3 5-8H7Z" /></>}
    </svg>
  );
}
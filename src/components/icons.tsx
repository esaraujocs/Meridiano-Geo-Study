export type IconType =
  | "arrow"
  | "map"
  | "flag"
  | "capital"
  | "lock"
  | "cross";

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
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8m-4-4h8" />
        </>
      )}
      {type === "lock" && (
        <>
          <rect x="5" y="10" width="14" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      )}
      {type === "cross" && <path d="M12 3v18M3 12h18" />}
    </svg>
  );
}
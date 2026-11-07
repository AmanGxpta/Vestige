import type { ReactNode, SVGProps } from "react";

/** The vestige V mark: two rounded strokes meeting at the base (brand board). */
export function VMark({ size = 26, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={(size * 26) / 30} viewBox="0 0 30 26" aria-hidden fill="none">
      <path d="M5.2 5.4 L12.6 19.6" stroke={color} strokeWidth="9" strokeLinecap="round" />
      <path d="M24.6 5.2 L19.4 14.4" stroke={color} strokeWidth="7.6" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ size = 21 }: { size?: number }) {
  return (
    <span className="brand" style={{ fontSize: size }}>
      <VMark size={Math.round(size * 1.28)} />
      vestige
    </span>
  );
}

type IconName =
  | "home"
  | "plus"
  | "compass"
  | "shield"
  | "user"
  | "users"
  | "file"
  | "layers"
  | "eye"
  | "bolt"
  | "back"
  | "search"
  | "globe"
  | "check"
  | "lock"
  | "pen"
  | "arrow"
  | "send"
  | "external"
  | "activity";

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.6 3.5 2.6 3.5 5.7" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  pen: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  send: <path d="m4 12 16-8-6 16-3-7z" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
};

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {PATHS[name]}
    </svg>
  );
}

/** Deterministic tile tint + initial for a venture name (no uploaded logos exist yet). */
export function VentureTile({ name, large = false }: { name: string; large?: boolean }) {
  const tints = ["var(--tint-lilac)", "var(--tint-peach)", "var(--tint-mint)", "var(--tint-sand)"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span className={`logo-tile${large ? " logo-tile-lg" : ""}`} style={{ background: tints[h % tints.length] }} aria-hidden>
      {(name.replace(/[^a-z0-9]/gi, "")[0] ?? "v").toUpperCase()}
    </span>
  );
}

/** Original mountain silhouette for the public verification hero (no external imagery). */
export function Mountains() {
  return (
    <svg className="mountains" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden>
      <defs>
        <radialGradient id="sun" cx="78%" cy="62%" r="40%">
          <stop offset="0" stopColor="#f5c518" stopOpacity="0.85" />
          <stop offset="1" stopColor="#f5c518" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="300" fill="url(#sun)" />
      <path d="M0 210 L120 150 L230 190 L360 110 L470 170 L560 130 L690 190 L820 120 L930 170 L1050 140 L1200 190 L1200 300 L0 300Z" fill="#3b2c19" opacity="0.75" />
      <path d="M0 250 L150 200 L290 240 L420 185 L560 235 L700 195 L860 240 L1000 205 L1200 245 L1200 300 L0 300Z" fill="#20180f" />
    </svg>
  );
}

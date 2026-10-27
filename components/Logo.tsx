/** The PickSlix mark: a Pick 6 ticket with a lightning bolt. Same drawing as app/icon.svg. */
export default function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="logo">
      <defs>
        <linearGradient id="pxg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3dff9a" />
          <stop offset=".5" stopColor="#14d6c8" />
          <stop offset="1" stopColor="#6a5cff" />
        </linearGradient>
        <linearGradient id="pxs" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#pxg)" />
      <rect width="64" height="64" rx="16" fill="url(#pxs)" />
      <g transform="rotate(-12 32 32)">
        <path
          d="M15 17h34a3 3 0 0 1 3 3v7a5 5 0 0 0 0 10v7a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3v-7a5 5 0 0 0 0-10v-7a3 3 0 0 1 3-3z"
          fill="#0b0f14"
        />
        <path d="M22 20.5v23" stroke="#3dff9a" strokeOpacity=".45" strokeWidth="1.6" strokeDasharray="2.4 2.4" />
        <path d="M39 18.5 26 34.5h7.5L30 46l14-17h-7.5l2.5-10.5z" fill="url(#pxg)" />
      </g>
    </svg>
  );
}

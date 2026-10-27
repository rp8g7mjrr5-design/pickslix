/** The LegUp mark: three slip legs stepping up, with an arrow on top. Same drawing as app/icon.svg. */
export default function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="logo">
      <defs>
        <linearGradient id="lug" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#3dff9a" />
          <stop offset=".5" stopColor="#14d6c8" />
          <stop offset="1" stopColor="#6a5cff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#141a22" />
      <rect x=".5" y=".5" width="63" height="63" rx="13.5" fill="none" stroke="#273140" />
      <rect x="13" y="37" width="9" height="14" rx="3" fill="url(#lug)" />
      <rect x="27.5" y="29" width="9" height="22" rx="3" fill="url(#lug)" />
      <rect x="42" y="21" width="9" height="30" rx="3" fill="url(#lug)" />
      <path d="M41.5 15.5 46.5 10.5 51.5 15.5" fill="none" stroke="url(#lug)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

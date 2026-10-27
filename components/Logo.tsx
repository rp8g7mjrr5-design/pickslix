/** The LayLock mark: two Ls locked together around a keyhole. Same drawing as app/icon.svg. */
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="logo">
      <path d="M16 9v38h20" fill="none" stroke="#2bf59b" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M48 55V17H28" fill="none" stroke="#eef3f8" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="29" r="4.5" fill="#2bf59b" />
      <path d="M29.8 31 28.6 38.5h6.8L34.2 31z" fill="#2bf59b" />
    </svg>
  );
}

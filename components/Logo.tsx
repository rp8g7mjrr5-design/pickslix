/** The Crew Check ticket: "CREW", a tear line, and a check. Styled by .ticket in globals.css. */
export default function Logo() {
  return (
    <span className="ticket" aria-hidden>
      Crew
      <span className="tear" />
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12.5 9.5 18 20 6" />
      </svg>
    </span>
  );
}

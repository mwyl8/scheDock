/** Minimal pier mark - geometric, not an illustration dump */
export function PierMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="28"
      height="22"
      viewBox="0 0 28 22"
      fill="none"
      aria-hidden
    >
      {/* Pilings */}
      <path d="M4 4v14M14 2v16M24 4v14" stroke="currentColor" strokeWidth="2" />
      {/* Deck */}
      <path d="M1 8h26" stroke="currentColor" strokeWidth="2" />
      {/* Hull silhouette under the pier */}
      <path
        d="M6 18c2.5-2 5-3 8-3s5.5 1 8 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      />
    </svg>
  );
}

import type { SVGProps } from "react";

/** Paired gloves drawn to match the navigation's outline icons. */
export function BoxingGloves({
  size = 24,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <g transform="rotate(-12 6 12)">
        <path d="M3 15C1.8 13.6 1.5 11.6 1.5 9V7a3.5 3.5 0 0 1 7 0v2l.5-.5a1.4 1.4 0 0 1 2 1.8L9 15" />
        <path d="M3 15h6v5H3zM3 17.5h6" />
      </g>
      <g transform="translate(24 0) scale(-1 1) rotate(-12 6 12)">
        <path d="M3 15C1.8 13.6 1.5 11.6 1.5 9V7a3.5 3.5 0 0 1 7 0v2l.5-.5a1.4 1.4 0 0 1 2 1.8L9 15" />
        <path d="M3 15h6v5H3zM3 17.5h6" />
      </g>
    </svg>
  );
}

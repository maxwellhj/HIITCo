import type { SVGProps } from "react";

/** Emoji-inspired right-hand boxing glove with rounded padding and an angled cuff. */
export function BoxingGlove({
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
      <g transform="rotate(-25 12 12)">
        {/* Broad padded fist with a tucked thumb, inspired by 🥊. */}
        <path d="M8 15.5c-2.8 0-4.5-1.8-4.5-3.8 0-1.3.6-2.2 1.7-2.6V7.5C5.2 4 7.6 2 11.3 2h2.1C17 2 19 4.3 19 7.6v1.9c0 2.6-1.3 4.6-3 6" />
        <path d="M5.2 9.1c1.8-.3 3.8 1.3 4.2 3 .3 1.4-.5 2.6-1.8 3" />
        {/* Extended wrist and a single clean fastening seam. */}
        <path d="M8 15.5h8v6c0 .6-.4 1-1 1H9c-.6 0-1-.4-1-1Z" />
        <path d="M8 18h8" />
      </g>
    </svg>
  );
}

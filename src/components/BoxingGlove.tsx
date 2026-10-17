import type { SVGProps } from "react";

/** A single right-handed boxing glove, palm facing forward, drawn to match the navigation's outline icons. */
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
      {/* One continuous silhouette: padded fist, left-side thumb, longer wrist. */}
      <path d="M8 15c-2.5-1-4.5-3.4-4.5-5.5C3.5 8 4.3 7 5.5 7c.9 0 1.7.6 2.5 1.6V6c0-2.5 1.8-4 4.5-4H15c3 0 5 1.8 5 4.5V9c0 2.7-1.3 4.6-3.5 6v6.5c0 .6-.4 1-1 1H9c-.6 0-1-.4-1-1Z" />
      <path d="m8 8.6 1.3 1.8c.7 1 .5 2-.3 2.8M8 17h8.5M11 20h2.5" />
    </svg>
  );
}

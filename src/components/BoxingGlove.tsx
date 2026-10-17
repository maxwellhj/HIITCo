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
      {/* The thumb sits on the viewer’s left for a right-hand glove. */}
      <path d="M8 17.5c-2.4-1-4.6-3.6-5-6-.3-1.5.3-2.7 1.6-2.9 1.1-.2 2 .5 2.9 1.8V6.5C7.5 3.9 9.6 2 12.3 2H16c3 0 5 2 5 5v3.5c0 3.3-1.6 5.7-4 7" />
      {/* Broad padded knuckles and the stitched, curled-in thumb. */}
      <path d="M11 7.5c2.8-.8 6.3-.7 9.8.3M7.5 10.4l1.3 2c.8 1.2.5 2.5-.6 3.2" />
      {/* Wide wrist strap makes the silhouette read as a boxing glove. */}
      <rect x="7.5" y="17.5" width="10" height="4.5" rx="1" />
      <path d="M10 19.8h5" />
    </svg>
  );
}

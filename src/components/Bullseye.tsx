import type { SVGProps } from "react";
/** A visible arrow landing in the centre of a target. */
export function Bullseye({
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
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="10" cy="14" r="8" />
      <circle cx="10" cy="14" r="4" />
      <path d="m10 14 10-10M16 2v6h6" />
      <circle cx="10" cy="14" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

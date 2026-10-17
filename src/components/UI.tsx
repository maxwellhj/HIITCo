import type { ReactNode } from "react";
export function Brand() {
  return (
    <svg
      className="brand"
      viewBox="67 534 937 262"
      role="img"
      aria-label="HIIT Co."
    >
      {/* Frame the visible artwork; the original supplied PNG is unchanged. */}
      <image href="/hiit-co-logo.png" width="1080" height="1350" />
    </svg>
  );
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}

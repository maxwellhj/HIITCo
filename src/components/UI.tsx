import type { ReactNode } from "react";
export function Brand() {
  return (
    <div className="brand" aria-label="HIIT Co. logo placeholder">
      HIIT<span>Co.</span>
      <i />
    </div>
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

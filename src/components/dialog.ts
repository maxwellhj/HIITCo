export function containDialog(close: () => void) {
  const previous = document.activeElement as HTMLElement | null;
  const handler = (e: KeyboardEvent) => {
    const dialog = document.querySelector('[role="dialog"]');
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
    if (e.key === "Tab" && dialog) {
      const items = [
        ...dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select, a[href]",
        ),
      ];
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };
  const overflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", handler);
  return () => {
    document.body.style.overflow = overflow;
    document.removeEventListener("keydown", handler);
    previous?.focus();
  };
}

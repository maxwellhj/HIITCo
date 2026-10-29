export function defaultDisplayName(firstName: string, lastName: string) {
  const initial = Array.from(lastName.trim())[0];
  return `${firstName.trim()}${initial ? ` ${initial}.` : ""}`;
}
export function validDisplayName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 40 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

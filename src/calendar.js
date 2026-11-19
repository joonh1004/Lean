export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function monthDays(year, month) {
  const first = new Date(year, month, 1);
  const count =
    Math.ceil((first.getDay() + new Date(year, month + 1, 0).getDate()) / 7) *
    7;
  return Array.from({ length: count }, (_, i) =>
    dateKey(new Date(year, month, 1 - first.getDay() + i)),
  );
}

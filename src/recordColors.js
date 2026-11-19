export const RECORD_COLORS = [
  ["blue", "파랑"],
  ["green", "초록"],
  ["amber", "주황"],
  ["rose", "분홍"],
  ["purple", "보라"],
];

export function recordColor(value) {
  return RECORD_COLORS.some(([color]) => color === value) ? value : undefined;
}
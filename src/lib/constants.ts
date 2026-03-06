export const CATEGORIES = [
  "업무",
  "개발",
  "건강",
  "가족",
  "소개팅비즈니스",
  "온라인판매",
  "기타",
] as const;

export function getToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

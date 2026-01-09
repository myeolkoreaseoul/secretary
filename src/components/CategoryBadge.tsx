'use client';

interface CategoryBadgeProps {
  name: string;
  color?: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  '업무': '#3B82F6',
  '소개팅비즈니스': '#EC4899',
  '온라인판매': '#F59E0B',
  '건강': '#10B981',
  '가족': '#8B5CF6',
  '개발': '#6366F1',
  '기타': '#6B7280',
};

export default function CategoryBadge({ name, color }: CategoryBadgeProps) {
  const bgColor = color || CATEGORY_COLORS[name] || '#6B7280';

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: bgColor }}
    >
      {name}
    </span>
  );
}

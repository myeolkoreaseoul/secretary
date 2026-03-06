'use client';

import CategoryBadge from './CategoryBadge';
import EmployeeBadge from './EmployeeBadge';

interface ConversationCardProps {
  title: string | null;
  summary: string | null;
  date: string;
  employee?: {
    name: string;
    role: string | null;
  } | null;
  category?: {
    name: string;
    color: string | null;
  } | null;
}

export default function ConversationCard({
  title,
  summary,
  date,
  employee,
  category,
}: ConversationCardProps) {
  return (
    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {employee && (
          <EmployeeBadge name={employee.name} role={employee.role} />
        )}
        {category && (
          <CategoryBadge name={category.name} color={category.color} />
        )}
        <span className="text-sm text-gray-500">{date}</span>
      </div>
      <h3 className="font-medium mb-1">{title || '제목 없음'}</h3>
      {summary && (
        <p className="text-sm text-gray-600 dark:text-gray-400">{summary}</p>
      )}
    </div>
  );
}

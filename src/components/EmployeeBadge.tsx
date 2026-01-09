'use client';

interface EmployeeBadgeProps {
  name: string;
  role?: string | null;
}

const EMPLOYEE_COLORS: Record<string, string> = {
  claude: '#D97706',
  gemini: '#059669',
  grok: '#7C3AED',
  perplexity: '#2563EB',
  genspark: '#DC2626',
};

export default function EmployeeBadge({ name, role }: EmployeeBadgeProps) {
  const bgColor = EMPLOYEE_COLORS[name.toLowerCase()] || '#6B7280';

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: bgColor }}
    >
      {name}
      {role && <span className="opacity-75">({role})</span>}
    </span>
  );
}

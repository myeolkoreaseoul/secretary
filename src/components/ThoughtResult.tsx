'use client';

import { ThoughtResultItem } from '@/types';
import CategoryBadge from './CategoryBadge';

interface ThoughtResultProps {
  results: ThoughtResultItem[];
}

export default function ThoughtResult({ results }: ThoughtResultProps) {
  if (results.length === 0) return null;

  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-lg font-semibold">분류 결과</h2>
      <div className="grid gap-4">
        {results.map((item) => (
          <div
            key={item.id}
            className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
          >
            <div className="flex items-center gap-2 mb-2">
              <CategoryBadge name={item.category} />
              <span className="font-medium">{item.title}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {item.summary}
            </p>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <span className="font-medium">조언:</span> {item.advice}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

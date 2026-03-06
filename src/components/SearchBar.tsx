'use client';

import { useState } from 'react';

interface SearchBarProps {
  onSearch: (query: string, employee?: string, category?: string) => void;
}

const EMPLOYEES = ['claude', 'gemini', 'grok', 'perplexity', 'genspark'];
const CATEGORIES = ['업무', '소개팅비즈니스', '온라인판매', '건강', '가족', '개발', '기타'];

export default function SearchBar({ onSearch }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [employee, setEmployee] = useState('');
  const [category, setCategory] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query, employee || undefined, category || undefined);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색어를 입력하세요..."
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-900"
        />
      </div>
      <div className="flex gap-4">
        <select
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        >
          <option value="">모든 직원</option>
          {EMPLOYEES.map((emp) => (
            <option key={emp} value={emp}>
              {emp}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        >
          <option value="">모든 카테고리</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          검색
        </button>
      </div>
    </form>
  );
}

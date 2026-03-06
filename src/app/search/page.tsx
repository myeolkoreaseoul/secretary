'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import SearchBar from '@/components/SearchBar';
import CategoryBadge from '@/components/CategoryBadge';
import EmployeeBadge from '@/components/EmployeeBadge';
import { SearchResult } from '@/types';

export default function SearchPage() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (query: string, employee?: string, category?: string) => {
    setLoading(true);
    setSearched(true);

    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (employee) params.set('employee', employee);
      if (category) params.set('category', category);

      const response = await apiFetch(`/api/search?${params.toString()}`);
      const data = await response.json();
      setResults(data.results || []);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">검색</h1>

      <SearchBar onSearch={handleSearch} />

      <div className="mt-8">
        {loading && (
          <p className="text-center text-gray-500">검색 중...</p>
        )}

        {!loading && searched && results.length === 0 && (
          <p className="text-center text-gray-500">검색 결과가 없습니다.</p>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{results.length}개의 결과</p>
            {results.map((result) => (
              <div
                key={`${result.type}-${result.id}`}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      result.type === 'conversation'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                        : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    }`}
                  >
                    {result.type === 'conversation' ? '대화' : '생각'}
                  </span>
                  {result.employee && (
                    <EmployeeBadge name={result.employee} />
                  )}
                  {result.category && (
                    <CategoryBadge name={result.category} />
                  )}
                  <span className="text-sm text-gray-500">{result.date}</span>
                </div>
                <h3 className="font-medium mb-1">{result.title || '제목 없음'}</h3>
                {result.summary && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {result.summary}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

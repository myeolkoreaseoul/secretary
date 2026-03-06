'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { ThoughtResultItem } from '@/types';

interface ThoughtInputProps {
  onResults: (results: ThoughtResultItem[]) => void;
}

export default function ThoughtInput({ onResults }: ThoughtInputProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    setLoading(true);
    try {
      const response = await apiFetch('/api/thought', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: input.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to process thought');
      }

      const data = await response.json();
      onResults(data.results);
      setInput('');
    } catch (error) {
      console.error('Error:', error);
      alert('처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="mb-4">
        <label
          htmlFor="thought"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          생각을 입력하세요
        </label>
        <textarea
          id="thought"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="오늘 있었던 일, 해야 할 일, 고민거리 등 아무 생각이나 던져주세요..."
          className="w-full h-32 px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white dark:bg-gray-900"
          disabled={loading}
        />
      </div>
      <button
        type="submit"
        disabled={!input.trim() || loading}
        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
      >
        {loading ? '분류 중...' : '분리수거 하기'}
      </button>
    </form>
  );
}

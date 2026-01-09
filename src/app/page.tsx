'use client';

import { useState } from 'react';
import ThoughtInput from '@/components/ThoughtInput';
import ThoughtResult from '@/components/ThoughtResult';
import { ThoughtResultItem } from '@/types';

export default function Home() {
  const [results, setResults] = useState<ThoughtResultItem[]>([]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">생각 분리수거</h1>
        <p className="text-gray-600 dark:text-gray-400">
          아무 생각이나 던져주세요. AI 비서가 분류하고 조언해드립니다.
        </p>
      </div>

      <ThoughtInput onResults={setResults} />
      <ThoughtResult results={results} />
    </div>
  );
}

'use client'

import { useState } from 'react'
import type { AISource } from '@/types/database'

const SECRETARY_OPTIONS: { value: AISource; label: string; url: string }[] = [
  { value: 'claude', label: '🟣 Claude', url: 'https://claude.ai' },
  { value: 'gemini', label: '🔵 Gemini', url: 'https://gemini.google.com' },
  { value: 'gpt', label: '🟢 GPT', url: 'https://chatgpt.com' },
  { value: 'grok', label: '⚫ Grok', url: 'https://grok.x.ai' },
]

export default function SecretarySection() {
  const [currentSecretary, setCurrentSecretary] = useState<AISource>('claude')

  const currentConfig = SECRETARY_OPTIONS.find(o => o.value === currentSecretary)!

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          🤵 비서에게 말하기
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">현재:</span>
          <select
            value={currentSecretary}
            onChange={(e) => setCurrentSecretary(e.target.value as AISource)}
            className="text-sm border rounded-lg px-2 py-1 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            {SECRETARY_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 text-center">
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          💬 비서와 대화하려면 {currentConfig.label}를 열어주세요
        </p>
        <a
          href={currentConfig.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          {currentConfig.label} 열기
        </a>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
          💡 대화가 끝나면 <strong>[공유 &gt; 링크 복사]</strong> 또는 내보내기 해주세요
        </p>
      </div>
    </section>
  )
}

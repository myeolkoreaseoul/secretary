'use client'

import type { AISource } from '@/types/database'

interface Expert {
  ai: AISource
  name: string
  role: string
  icon: string
  url: string
  color: string
}

const EXPERTS: Expert[] = [
  {
    ai: 'claude',
    name: 'Claude',
    role: 'CTO',
    icon: '🟣',
    url: 'https://claude.ai',
    color: 'bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-900/50',
  },
  {
    ai: 'gemini',
    name: 'Gemini',
    role: '총무',
    icon: '🔵',
    url: 'https://gemini.google.com',
    color: 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50',
  },
  {
    ai: 'grok',
    name: 'Grok',
    role: '마케팅',
    icon: '⚫',
    url: 'https://grok.x.ai',
    color: 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600',
  },
  {
    ai: 'gpt',
    name: 'GPT',
    role: '홍보',
    icon: '🟢',
    url: 'https://chatgpt.com',
    color: 'bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50',
  },
]

export default function ExpertLinks() {
  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
        👥 전문가 바로가기
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {EXPERTS.map((expert) => (
          <a
            key={expert.ai}
            href={expert.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`
              ${expert.color}
              rounded-lg p-4 text-center transition-colors
            `}
          >
            <div className="text-2xl mb-1">{expert.icon}</div>
            <div className="font-medium text-gray-900 dark:text-white">
              {expert.name}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              ({expert.role})
            </div>
          </a>
        ))}
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 text-center">
        💡 대화 후 내보내기를 잊지 마세요!
      </p>
    </section>
  )
}

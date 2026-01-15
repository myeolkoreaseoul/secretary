'use client'

import type { Conversation, AISource } from '@/types/database'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface DashboardProps {
  conversations: Conversation[]
}

const AI_CONFIG: Record<AISource, { name: string; color: string; icon: string; role: string }> = {
  claude: { name: 'Claude', color: 'bg-purple-500', icon: '🟣', role: 'CTO' },
  gemini: { name: 'Gemini', color: 'bg-blue-500', icon: '🔵', role: '총무' },
  grok: { name: 'Grok', color: 'bg-gray-800', icon: '⚫', role: '마케팅' },
  gpt: { name: 'GPT', color: 'bg-green-500', icon: '🟢', role: '홍보' },
}

export default function Dashboard({ conversations }: DashboardProps) {
  const today = format(new Date(), 'yyyy년 M월 d일', { locale: ko })

  const countByAI = (ai: AISource) =>
    conversations.filter(c => c.ai_source === ai).length

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          📊 오늘의 현황
        </h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">{today}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(Object.keys(AI_CONFIG) as AISource[]).map((ai) => {
          const config = AI_CONFIG[ai]
          const count = countByAI(ai)
          return (
            <div
              key={ai}
              className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center"
            >
              <div className="text-2xl mb-1">{config.icon}</div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {count}회
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {config.name}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                ({config.role})
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

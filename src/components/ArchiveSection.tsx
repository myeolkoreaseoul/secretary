'use client'

import { useState } from 'react'
import { format, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { DailyArchive } from '@/types/database'

// 샘플 데이터 (실제로는 Supabase에서 가져옴)
const SAMPLE_ARCHIVES: DailyArchive[] = [
  {
    id: '1',
    date: format(new Date(), 'yyyy-MM-dd'),
    summary: '오늘은 뭘좀 관리자페이지 작업과 PT 등록 논의를 진행했습니다.',
    todos: [
      { text: '가스비 납부 (1/20까지)', completed: false },
      { text: 'PT 등록', completed: false },
      { text: '희영이 연락', completed: false },
    ],
    ideas: ['A앱 - 위치 기반 소셜 서비스'],
    timeline: [
      { time: '09:00', ai_source: 'gemini', summary: 'PT 등록 논의', conversation_id: '1' },
      { time: '11:30', ai_source: 'claude', summary: '뭘좀 관리자페이지 작업', conversation_id: '2' },
      { time: '14:00', ai_source: 'grok', summary: '마케팅 아이디어 브레인스톰', conversation_id: '3' },
    ],
    created_at: new Date().toISOString(),
  },
]

const AI_ICONS: Record<string, string> = {
  claude: '🟣',
  gemini: '🔵',
  grok: '⚫',
  gpt: '🟢',
}

export default function ArchiveSection() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  // 최근 7일 날짜 목록
  const recentDates = Array.from({ length: 7 }, (_, i) =>
    format(subDays(new Date(), i), 'yyyy-MM-dd')
  )

  const currentArchive = SAMPLE_ARCHIVES.find(a => a.date === selectedDate)

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
        📅 일일 아카이브
      </h2>

      <div className="grid md:grid-cols-[200px_1fr] gap-6">
        {/* 날짜 선택 */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            📆 날짜 선택
          </h3>
          {recentDates.map((date) => (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`
                w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                ${selectedDate === date
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }
              `}
            >
              {format(new Date(date), 'M월 d일 (E)', { locale: ko })}
            </button>
          ))}
        </div>

        {/* 아카이브 내용 */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          {currentArchive ? (
            <>
              <h3 className="font-medium text-gray-900 dark:text-white mb-4">
                📊 {format(new Date(currentArchive.date), 'yyyy년 M월 d일', { locale: ko })} 요약
              </h3>

              {/* 타임라인 */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  🕐 타임라인
                </h4>
                <div className="space-y-1">
                  {currentArchive.timeline.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500 dark:text-gray-400 w-12">{item.time}</span>
                      <span>{AI_ICONS[item.ai_source]}</span>
                      <span className="text-gray-700 dark:text-gray-300">{item.summary}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 할 일 */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  ✅ 할 일
                </h4>
                <div className="space-y-1">
                  {currentArchive.todos.map((todo, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span>{todo.completed ? '☑️' : '☐'}</span>
                      <span className={`${todo.completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                        {todo.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 아이디어 */}
              {currentArchive.ideas.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    💡 아이디어
                  </h4>
                  <div className="space-y-1">
                    {currentArchive.ideas.map((idea, idx) => (
                      <div key={idx} className="text-sm text-gray-700 dark:text-gray-300">
                        • {idea}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <button className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  Notion에서 보기
                </button>
                <button className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  PDF 다운로드
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              선택한 날짜의 아카이브가 없습니다
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

'use client'

import { useState } from 'react'
import type { Conversation, AISource } from '@/types/database'
import { format } from 'date-fns'

interface SearchSectionProps {
  onSearch: (query: string) => void
  results: Conversation[]
  query: string
}

const AI_ICONS: Record<AISource, string> = {
  claude: '🟣',
  gemini: '🔵',
  grok: '⚫',
  gpt: '🟢',
}

export default function SearchSection({ onSearch, results, query }: SearchSectionProps) {
  const [inputValue, setInputValue] = useState('')
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())
  const [targetAI, setTargetAI] = useState<AISource>('gemini')
  const [additionalRequest, setAdditionalRequest] = useState('')
  const [generatedPrompt, setGeneratedPrompt] = useState('')

  const handleSearch = () => {
    onSearch(inputValue)
  }

  const toggleResult = (id: string) => {
    const newSelected = new Set(selectedResults)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedResults(newSelected)
  }

  const generatePrompt = () => {
    const selected = results.filter(r => selectedResults.has(r.id))
    if (selected.length === 0) return

    let prompt = `[배경 정보]\n`
    selected.forEach(conv => {
      const date = format(new Date(conv.created_at), 'M/d')
      prompt += `- ${date}: ${conv.summary || conv.title}\n`
    })
    prompt += `\n[요청]\n${additionalRequest || '위 내용을 바탕으로 도와주세요.'}`

    setGeneratedPrompt(prompt)
  }

  const copyPrompt = () => {
    navigator.clipboard.writeText(generatedPrompt)
    alert('프롬프트가 복사되었습니다!')
  }

  const AI_URLS: Record<AISource, string> = {
    claude: 'https://claude.ai',
    gemini: 'https://gemini.google.com',
    grok: 'https://grok.x.ai',
    gpt: 'https://chatgpt.com',
  }

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
        🔍 맥락 검색 & 프롬프트 생성
      </h2>

      {/* 검색창 */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="검색어를 입력하세요 (예: 뭘좀 관리자페이지)"
          className="flex-1 border rounded-lg px-4 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
        <button
          onClick={handleSearch}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          🔍 검색
        </button>
      </div>

      {/* 검색 결과 */}
      {query && (
        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {results.length}건의 관련 대화를 찾았습니다
          </p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {results.map((conv) => (
              <div
                key={conv.id}
                onClick={() => toggleResult(conv.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedResults.has(conv.id)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedResults.has(conv.id)}
                    onChange={() => {}}
                    className="rounded"
                  />
                  <span className="text-gray-500">
                    {format(new Date(conv.created_at), 'M/d HH:mm')}
                  </span>
                  <span>{AI_ICONS[conv.ai_source]}</span>
                  <span className="font-medium dark:text-white">{conv.title}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                  {conv.summary || conv.content.slice(0, 100)}...
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 프롬프트 생성 */}
      {selectedResults.size > 0 && (
        <div className="border-t pt-4 dark:border-gray-600">
          <h3 className="font-medium text-gray-900 dark:text-white mb-2">
            📋 맥락 프롬프트 생성
          </h3>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400">대상 AI</label>
              <select
                value={targetAI}
                onChange={(e) => setTargetAI(e.target.value as AISource)}
                className="w-full border rounded-lg px-3 py-2 mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="gemini">🔵 Gemini (총무)</option>
                <option value="grok">⚫ Grok (마케팅)</option>
                <option value="gpt">🟢 GPT (홍보)</option>
                <option value="claude">🟣 Claude (CTO)</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400">추가 요청</label>
              <input
                type="text"
                value={additionalRequest}
                onChange={(e) => setAdditionalRequest(e.target.value)}
                placeholder="예: 마케팅 전략 짜줘"
                className="w-full border rounded-lg px-3 py-2 mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>
          <button
            onClick={generatePrompt}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg mb-4"
          >
            📋 프롬프트 생성
          </button>

          {generatedPrompt && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  생성된 프롬프트
                </span>
                <button
                  onClick={copyPrompt}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  📋 복사
                </button>
              </div>
              <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {generatedPrompt}
              </pre>
              <a
                href={AI_URLS[targetAI]}
                target="_blank"
                rel="noopener noreferrer"
                onClick={copyPrompt}
                className="mt-4 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                {AI_ICONS[targetAI]} {targetAI.charAt(0).toUpperCase() + targetAI.slice(1)}에서 열기
              </a>
            </div>
          )}
        </div>
      )}

      {/* 대화 없을 때 */}
      {!query && results.length === 0 && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">
          검색어를 입력하면 저장된 대화에서 맥락을 찾아드립니다
        </p>
      )}
    </section>
  )
}

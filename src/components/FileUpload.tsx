'use client'

import { useState, useCallback } from 'react'
import type { Conversation, AISource, ExpertRole } from '@/types/database'

interface FileUploadProps {
  onUpload: (conversations: Conversation[]) => void
}

export default function FileUpload({ onUpload }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string>('')

  const detectAISource = (content: string, filename: string): AISource => {
    if (filename.includes('claude') || content.includes('Claude')) return 'claude'
    if (filename.includes('gemini') || content.includes('Gemini')) return 'gemini'
    if (filename.includes('grok') || content.includes('Grok')) return 'grok'
    if (filename.includes('chatgpt') || content.includes('ChatGPT')) return 'gpt'
    return 'claude' // 기본값
  }

  const detectRole = (aiSource: AISource): ExpertRole => {
    const roleMap: Record<AISource, ExpertRole> = {
      claude: 'cto',
      gemini: 'admin',
      grok: 'marketing',
      gpt: 'pr',
    }
    return roleMap[aiSource]
  }

  const parseConversation = async (file: File): Promise<Conversation[]> => {
    const content = await file.text()
    const aiSource = detectAISource(content, file.name)
    const role = detectRole(aiSource)

    // 간단한 파싱 - 실제로는 각 AI별로 다른 포맷 처리 필요
    const conversations: Conversation[] = [{
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ai_source: aiSource,
      role: role,
      title: file.name.replace(/\.(json|md|txt)$/, ''),
      content: content,
      summary: content.slice(0, 200) + '...',
      tags: extractTags(content),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }]

    return conversations
  }

  const extractTags = (content: string): string[] => {
    // 간단한 키워드 추출 (실제로는 AI로 처리)
    const words = content.toLowerCase().match(/[가-힣a-z]{2,}/g) || []
    const frequency: Record<string, number> = {}
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1
    })
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word)
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    setIsProcessing(true)
    setUploadStatus('파일 처리 중...')

    const files = Array.from(e.dataTransfer.files)
    const allConversations: Conversation[] = []

    for (const file of files) {
      try {
        const conversations = await parseConversation(file)
        allConversations.push(...conversations)
        setUploadStatus(`${file.name} 처리 완료`)
      } catch (error) {
        console.error(`Error parsing ${file.name}:`, error)
        setUploadStatus(`${file.name} 처리 실패`)
      }
    }

    if (allConversations.length > 0) {
      onUpload(allConversations)
      setUploadStatus(`${allConversations.length}개 대화 업로드 완료!`)
    }

    setIsProcessing(false)
    setTimeout(() => setUploadStatus(''), 3000)
  }, [onUpload])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    setIsProcessing(true)
    setUploadStatus('파일 처리 중...')

    const allConversations: Conversation[] = []

    for (const file of Array.from(files)) {
      try {
        const conversations = await parseConversation(file)
        allConversations.push(...conversations)
      } catch (error) {
        console.error(`Error parsing ${file.name}:`, error)
      }
    }

    if (allConversations.length > 0) {
      onUpload(allConversations)
      setUploadStatus(`${allConversations.length}개 대화 업로드 완료!`)
    }

    setIsProcessing(false)
    setTimeout(() => setUploadStatus(''), 3000)
  }

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
        📥 대화 업로드
      </h2>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600'
          }
          ${isProcessing ? 'opacity-50' : ''}
        `}
      >
        <div className="text-4xl mb-2">📁</div>
        <p className="text-gray-600 dark:text-gray-300 mb-2">
          대화 파일을 여기에 드래그하거나 클릭해서 업로드
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          지원: Claude(.md), ChatGPT(.json), Gemini, Grok
        </p>
        <label className="inline-block">
          <input
            type="file"
            multiple
            accept=".json,.md,.txt"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isProcessing}
          />
          <span className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 px-4 py-2 rounded-lg cursor-pointer text-gray-700 dark:text-gray-300">
            파일 선택
          </span>
        </label>
        {uploadStatus && (
          <p className="mt-4 text-sm text-blue-600 dark:text-blue-400">
            {uploadStatus}
          </p>
        )}
      </div>
    </section>
  )
}

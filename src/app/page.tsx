'use client'

import { useState, useEffect } from 'react'
import Dashboard from '@/components/Dashboard'
import SearchSection from '@/components/SearchSection'
import FileUpload from '@/components/FileUpload'
import ExpertLinks from '@/components/ExpertLinks'
import SecretarySection from '@/components/SecretarySection'
import ArchiveSection from '@/components/ArchiveSection'
import type { Conversation } from '@/types/database'

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Conversation[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const filtered = conversations.filter(c =>
      c.content.toLowerCase().includes(query.toLowerCase()) ||
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
    )
    setSearchResults(filtered)
  }

  const handleFileUpload = (newConversations: Conversation[]) => {
    setConversations(prev => [...prev, ...newConversations])
  }

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span>🧠</span> Brain System
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          AI 비서 & 전문가 팀 통합 시스템
        </p>
      </header>

      <div className="grid gap-6">
        <Dashboard conversations={conversations} />
        <SecretarySection />
        <SearchSection
          onSearch={handleSearch}
          results={searchResults}
          query={searchQuery}
        />
        <FileUpload onUpload={handleFileUpload} />
        <ExpertLinks />
        <ArchiveSection />
      </div>
    </main>
  )
}

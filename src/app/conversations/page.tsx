'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import ConversationCard from '@/components/ConversationCard';

interface ConversationData {
  id: string;
  title: string | null;
  summary: string | null;
  conversation_date: string | null;
  employee: {
    name: string;
    role: string | null;
  } | null;
  category: {
    name: string;
    color: string | null;
  } | null;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await apiFetch('/api/conversation');
        const data = await response.json();
        setConversations(data.conversations || []);
      } catch (error) {
        console.error('Error fetching conversations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">대화 목록</h1>

      {loading && (
        <p className="text-center text-gray-500">로딩 중...</p>
      )}

      {!loading && conversations.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-2">저장된 대화가 없습니다.</p>
          <p className="text-sm text-gray-400">
            브라우저 확장 프로그램을 사용해 AI 대화를 저장하세요.
          </p>
        </div>
      )}

      {!loading && conversations.length > 0 && (
        <div className="space-y-4">
          {conversations.map((conv) => (
            <ConversationCard
              key={conv.id}
              title={conv.title}
              summary={conv.summary}
              date={conv.conversation_date?.split('T')[0] || ''}
              employee={conv.employee}
              category={conv.category}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Options {
  table: string;
  filter?: string;
  onInsert: (row: Record<string, unknown>) => void;
}

export function useRealtimeInsert({ table, filter, onInsert }: Options) {
  useEffect(() => {
    const channelName = `realtime-${table}-${filter ?? 'all'}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = { event: 'INSERT', schema: 'public', table };
    if (filter) config.filter = filter;

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', config, (payload: { new: Record<string, unknown> }) => {
        onInsert(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // onInsert은 매 렌더마다 새 함수이므로 의존성에서 제외 (안정성 보장 시 useCallback 사용)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter]);
}

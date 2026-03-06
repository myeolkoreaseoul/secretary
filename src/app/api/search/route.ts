import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { SearchResult } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q') || '';
    const employee = searchParams.get('employee');
    const category = searchParams.get('category');

    const results: SearchResult[] = [];

    // 검색어를 tsquery 형식으로 변환
    const searchTerms = q.trim().split(/\s+/).filter(Boolean);
    const tsQuery = searchTerms.length > 0
      ? searchTerms.map(term => `${term}:*`).join(' & ')
      : '';

    // 대화 검색
    let conversationQuery = supabase
      .from('conversations')
      .select(`
        id, title, summary, conversation_date,
        employee:employees(name, role),
        category:categories(name, color)
      `)
      .order('conversation_date', { ascending: false })
      .limit(20);

    if (tsQuery) {
      conversationQuery = conversationQuery.textSearch('search_vector', tsQuery);
    }

    if (employee) {
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('name', employee.toLowerCase())
        .single();

      if (emp) {
        conversationQuery = conversationQuery.eq('employee_id', emp.id);
      }
    }

    if (category) {
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .eq('name', category)
        .single();

      if (cat) {
        conversationQuery = conversationQuery.eq('category_id', cat.id);
      }
    }

    const { data: conversations } = await conversationQuery;

    if (conversations) {
      for (const conv of conversations) {
        const emp = conv.employee as unknown as { name: string } | null;
        const cat = conv.category as unknown as { name: string } | null;
        results.push({
          type: 'conversation',
          id: conv.id,
          title: conv.title,
          employee: emp?.name,
          category: cat?.name || null,
          summary: conv.summary,
          date: conv.conversation_date?.split('T')[0] || '',
        });
      }
    }

    // 생각 검색
    let thoughtQuery = supabase
      .from('thoughts')
      .select(`
        id, title, summary, date,
        category:categories(name, color)
      `)
      .order('date', { ascending: false })
      .limit(20);

    if (tsQuery) {
      thoughtQuery = thoughtQuery.textSearch('search_vector', tsQuery);
    }

    if (category) {
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .eq('name', category)
        .single();

      if (cat) {
        thoughtQuery = thoughtQuery.eq('category_id', cat.id);
      }
    }

    const { data: thoughts } = await thoughtQuery;

    if (thoughts) {
      for (const thought of thoughts) {
        const cat = thought.category as unknown as { name: string } | null;
        results.push({
          type: 'thought',
          id: thought.id,
          title: thought.title,
          category: cat?.name || null,
          summary: thought.summary,
          date: thought.date,
        });
      }
    }

    // 날짜순 정렬
    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ results: results.slice(0, 30) });
  } catch (error) {
    console.error('Error searching:', error);
    return NextResponse.json(
      { error: '검색 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

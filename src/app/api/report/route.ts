import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateParam = searchParams.get('date');
    const date = dateParam || new Date().toISOString().split('T')[0];

    // 해당 날짜의 생각 조회
    const { data: thoughts } = await supabase
      .from('thoughts')
      .select(`
        *,
        category:categories(name, color)
      `)
      .eq('date', date)
      .order('created_at', { ascending: false });

    // 해당 날짜의 대화 조회
    const { data: conversations } = await supabase
      .from('conversations')
      .select(`
        *,
        employee:employees(name, role),
        category:categories(name, color)
      `)
      .gte('conversation_date', `${date}T00:00:00`)
      .lt('conversation_date', `${date}T23:59:59`)
      .order('conversation_date', { ascending: false });

    // 카테고리별 집계
    const categoryMap = new Map<string, {
      category: string;
      color: string;
      count: number;
      items: unknown[];
    }>();

    thoughts?.forEach((thought) => {
      const cat = thought.category as { name: string; color: string } | null;
      const categoryName = cat?.name || '기타';
      const categoryColor = cat?.color || '#6B7280';

      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          category: categoryName,
          color: categoryColor,
          count: 0,
          items: [],
        });
      }

      const entry = categoryMap.get(categoryName)!;
      entry.count++;
      entry.items.push(thought);
    });

    conversations?.forEach((conv) => {
      const cat = conv.category as { name: string; color: string } | null;
      const categoryName = cat?.name || '기타';
      const categoryColor = cat?.color || '#6B7280';

      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          category: categoryName,
          color: categoryColor,
          count: 0,
          items: [],
        });
      }

      const entry = categoryMap.get(categoryName)!;
      entry.count++;
      entry.items.push(conv);
    });

    // 직원별 집계
    const employeeMap = new Map<string, {
      employee: string;
      role: string;
      count: number;
      items: unknown[];
    }>();

    conversations?.forEach((conv) => {
      const emp = conv.employee as { name: string; role: string } | null;
      const employeeName = emp?.name || 'unknown';
      const employeeRole = emp?.role || '';

      if (!employeeMap.has(employeeName)) {
        employeeMap.set(employeeName, {
          employee: employeeName,
          role: employeeRole,
          count: 0,
          items: [],
        });
      }

      const entry = employeeMap.get(employeeName)!;
      entry.count++;
      entry.items.push(conv);
    });

    return NextResponse.json({
      date,
      summary: {
        thoughts: thoughts?.length || 0,
        conversations: conversations?.length || 0,
      },
      by_category: Array.from(categoryMap.values()),
      by_employee: Array.from(employeeMap.values()),
    });
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: '리포트 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

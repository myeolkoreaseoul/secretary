import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { summarizeConversation } from '@/lib/classifier';
import { ConversationRequest } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: ConversationRequest = await request.json();
    const { employee, content, source_url, conversation_date } = body;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: '대화 내용이 필요합니다.' },
        { status: 400 }
      );
    }

    // 직원 조회
    const { data: employeeData } = await supabase
      .from('employees')
      .select('id')
      .eq('name', employee.toLowerCase())
      .single();

    if (!employeeData) {
      return NextResponse.json(
        { error: '존재하지 않는 직원입니다.' },
        { status: 400 }
      );
    }

    // Claude API로 요약
    const summary = await summarizeConversation(content);

    // 카테고리 조회
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name');

    const categoryMap = new Map(
      categories?.map((c) => [c.name, c.id]) || []
    );

    const categoryId = categoryMap.get(summary.category) || null;

    // DB에 저장
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({
        employee_id: employeeData.id,
        content,
        source_url,
        conversation_date: conversation_date || new Date().toISOString(),
        title: summary.title,
        summary: summary.summary,
        category_id: categoryId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving conversation:', error);
      return NextResponse.json(
        { error: '저장 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: conversation.id,
      title: summary.title,
      category: summary.category,
      summary: summary.summary,
    });
  } catch (error) {
    console.error('Error processing conversation:', error);
    return NextResponse.json(
      { error: '처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        *,
        employee:employees(name, role),
        category:categories(name, color)
      `)
      .order('conversation_date', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching conversations:', error);
      return NextResponse.json(
        { error: '조회 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: '조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

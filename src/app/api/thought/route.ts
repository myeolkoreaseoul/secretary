import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { classifyThought } from '@/lib/classifier';
import { ThoughtRequest, ThoughtResponse } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: ThoughtRequest = await request.json();
    const { input } = body;

    if (!input || !input.trim()) {
      return NextResponse.json(
        { error: '입력이 필요합니다.' },
        { status: 400 }
      );
    }

    // Claude API로 분류
    const classifierResult = await classifyThought(input);

    // 카테고리 목록 조회
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name');

    const categoryMap = new Map(
      categories?.map((c) => [c.name, c.id]) || []
    );

    // 각 분류 결과를 DB에 저장
    const results: ThoughtResponse['results'] = [];

    for (const item of classifierResult.items) {
      const categoryId = categoryMap.get(item.category) || null;

      const { data: thought, error } = await supabase
        .from('thoughts')
        .insert({
          raw_input: input,
          category_id: categoryId,
          title: item.title,
          summary: item.summary,
          advice: item.advice,
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving thought:', error);
        continue;
      }

      results.push({
        id: thought.id,
        category: item.category,
        title: item.title,
        summary: item.summary,
        advice: item.advice,
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Error processing thought:', error);
    return NextResponse.json(
      { error: '처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

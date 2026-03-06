import { callGemini } from './gemini';
import { ClassifierResponse } from '@/types';

const CLASSIFIER_PROMPT = `당신은 생각 분리수거 전문가입니다.
사용자가 던진 텍스트를 분석해서 각각의 주제를 분류하고, 요약하고, 조언을 제공합니다.

## 카테고리
- 업무: 회사 업무, 거래처, 세금, 회계 관련
- 소개팅비즈니스: 소개팅앱 개발, 수익모델, 마케팅 등
- 온라인판매: 이커머스, 온라인 판매 사업
- 건강: 신체 건강, 운동, 병원
- 가족: 가족 관련 일
- 개발: 코딩, 기술, 시스템 구축
- 기타: 위에 해당 안 되는 것

## 규칙
1. 하나의 입력에 여러 주제가 있으면 각각 분리해서 처리
2. 각 주제마다: 카테고리, 제목(20자 이내), 요약(50자 이내), 조언(100자 이내) 제공
3. 조언은 실용적이고 구체적으로

## 출력 형식 (JSON만 출력, 다른 텍스트 없이)
{
  "items": [
    {
      "category": "카테고리명",
      "title": "제목",
      "summary": "요약",
      "advice": "조언"
    }
  ]
}`;

const SUMMARIZER_PROMPT = `당신은 대화 요약 전문가입니다.
AI와의 대화 내용을 분석해서 제목, 카테고리, 요약을 제공합니다.

## 카테고리
- 업무: 회사 업무, 거래처, 세금, 회계 관련
- 소개팅비즈니스: 소개팅앱 개발, 수익모델, 마케팅 등
- 온라인판매: 이커머스, 온라인 판매 사업
- 건강: 신체 건강, 운동, 병원
- 가족: 가족 관련 일
- 개발: 코딩, 기술, 시스템 구축
- 기타: 위에 해당 안 되는 것

## 규칙
1. 제목은 20자 이내로 대화의 핵심 주제를 나타냄
2. 요약은 100자 이내로 대화의 핵심 내용을 정리
3. 가장 적절한 카테고리 하나 선택

## 출력 형식 (JSON만 출력, 다른 텍스트 없이)
{
  "title": "제목",
  "category": "카테고리명",
  "summary": "요약"
}`;

export async function classifyThought(input: string): Promise<ClassifierResponse> {
  const response = await callGemini(CLASSIFIER_PROMPT, input);

  // JSON 파싱
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse classifier response');
  }

  return JSON.parse(jsonMatch[0]) as ClassifierResponse;
}

export async function summarizeConversation(content: string): Promise<{
  title: string;
  category: string;
  summary: string;
}> {
  const response = await callGemini(SUMMARIZER_PROMPT, content);

  // JSON 파싱
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse summarizer response');
  }

  return JSON.parse(jsonMatch[0]);
}

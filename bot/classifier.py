"""Gemini-based message classifier for the secretary bot.

Uses Gemini 2.0 Flash Lite (free tier: 1500 req/day).
Runs synchronously — call via asyncio.to_thread from async contexts.
"""

import json
import logging
import re

import httpx

from bot.config import GEMINI_API_KEY

log = logging.getLogger("secretary.classifier")

GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.0-flash-lite:generateContent"
)

_PROMPT = """당신은 생각 분리수거 전문가입니다.
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
}"""


def classify_message(content: str) -> dict | None:
    """Classify a message using Gemini 2.0 Flash Lite.

    Returns {"items": [...]} on success, None on failure (never raises).
    """
    if not GEMINI_API_KEY:
        log.warning("GEMINI_API_KEY not set, skipping classification")
        return None

    if len(content.strip()) < 5:
        return None

    try:
        resp = httpx.post(
            GEMINI_API_URL,
            params={"key": GEMINI_API_KEY},
            json={
                "contents": [
                    {"parts": [{"text": f"{_PROMPT}\n\n입력:\n{content}"}]}
                ],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 1024,
                },
            },
            timeout=15.0,
        )
        resp.raise_for_status()

        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]

        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            log.warning("No JSON in Gemini response for classification")
            return None

        result = json.loads(match.group())
        if not isinstance(result.get("items"), list):
            log.warning("Invalid classification format: %s", result)
            return None

        log.debug("Classified into %d item(s)", len(result["items"]))
        return result

    except httpx.HTTPStatusError as e:
        log.error("Gemini API %d: %s", e.response.status_code, e.response.text[:200])
        return None
    except Exception as e:
        log.error("Classification error: %s", e)
        return None

import "server-only";
import OpenAI from "openai";

// OpenAI 연결은 서버에서만 만든다. 열쇠는 .env의 OPENAI_API_KEY에서 읽는다 (CLAUDE.md 보안 규칙).
let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  }
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// 쓸 모델. 빠르고 저렴한 모델을 기본으로 하고, 바꾸려면 .env에 OPENAI_MODEL을 적는다.
export function modelName(): string {
  return process.env.OPENAI_MODEL || "gpt-5.4-mini";
}

// gpt-5 계열은 생각하는 정도를 낮춰 1분 목표 안에 답하게 한다 (DESIGN.md §3 처리 시간 배분)
export function reasoningOption(): { reasoning?: { effort: "low" } } {
  return modelName().startsWith("gpt-5") ? { reasoning: { effort: "low" } } : {};
}

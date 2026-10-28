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

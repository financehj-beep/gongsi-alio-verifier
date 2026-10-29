import "server-only";

// Design Ref: DESIGN.md §8 보안 — 한 번의 요청이 AI를 끝없이 부르지 못하게 양과 동시 호출 수를 제한한다.
// 주소를 아는 누구나 호출할 수 있어 요청 하나가 수백 건의 AI 호출(=요금)로 번지는 것을 막기 위해서다.

// 한 번의 검사에서 AI에게 보낼 수 있는 조각(묶음) 수의 상한
export const MAX_AI_CHUNKS = 15;
// 화면이 보낸 글자의 문단·문장 수 상한 (정상 공고는 수백 개 수준)
export const MAX_PARAGRAPHS = 5000;
export const MAX_WEB_SENTENCES = 8000;
// AI를 동시에 부르는 수
const CONCURRENCY = 4;

export const TOO_LONG_MESSAGE = "문서 글자가 너무 많아 검증할 수 없습니다. 부점에 내용을 나눈 파일을 요청해 주세요.";

export class TooLongError extends Error {
  constructor() {
    super(TOO_LONG_MESSAGE);
    this.name = "TooLongError";
  }
}

// 조각 수가 상한을 넘으면 AI를 부르기 전에 멈춘다
export function assertChunkCount(count: number): void {
  if (count > MAX_AI_CHUNKS) throw new TooLongError();
}

// 문단·문장 수가 비정상적으로 많으면 멈춘다 (짝 맞추기가 문장 수의 제곱만큼 걸리기 때문)
export function assertCounts(paragraphs: number, webSentences = 0): void {
  if (paragraphs > MAX_PARAGRAPHS || webSentences > MAX_WEB_SENTENCES) throw new TooLongError();
}

// 동시에 CONCURRENCY개까지만 실행하며 결과를 순서대로 모은다
export async function mapLimit<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

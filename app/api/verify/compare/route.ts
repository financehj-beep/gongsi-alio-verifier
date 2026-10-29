import { TooLongError, TOO_LONG_MESSAGE } from "@/lib/ai/pool";
import { compareTexts } from "@/lib/ai/compare";
import type { HwpDocument } from "@/lib/readers/hwp-types";
import type { WebPage } from "@/lib/readers/web";

// Design Ref: DESIGN.md §6 2단계 비교 — 화면이 보낸 글자로 불일치·누락·확인 필요를 돌려준다
export const maxDuration = 60;

// 화면이 한 번에 보내는 양 한도 (Vercel 서버 한도 약 4.5MB보다 작게, DESIGN.md §3 전송 한도)
const MAX_BODY_BYTES = 4 * 1024 * 1024;

function fail(status: number, message: string) {
  return Response.json({ ok: false, error: { message } }, { status });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return fail(413, "문서 글자가 너무 많아 검증할 수 없습니다. 부점에 내용을 나눈 파일을 요청해 주세요.");
  }

  let hwp: HwpDocument;
  let web: WebPage;
  try {
    ({ hwp, web } = JSON.parse(raw) as { hwp: HwpDocument; web: WebPage });
    if (!Array.isArray(hwp?.paragraphs) || !Array.isArray(web?.blocks)) throw new Error();
  } catch {
    return fail(400, "요청 형식이 올바르지 않습니다.");
  }

  try {
    const findings = await compareTexts(hwp, web);
    return Response.json({ ok: true, findings });
  } catch (error) {
    if (error instanceof TooLongError) return fail(413, TOO_LONG_MESSAGE);
    return fail(502, "AI 검사 중 문제가 생겼습니다 (비교 단계). 다시 시도해 주세요.");
  }
}

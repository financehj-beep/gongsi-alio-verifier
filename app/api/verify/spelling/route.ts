import { checkSpelling } from "@/lib/ai/spelling";
import type { HwpDocument } from "@/lib/readers/hwp-types";

// Design Ref: DESIGN.md §6 3단계 맞춤법 — 화면이 보낸 한글파일 글자로 맞춤법 결과를 돌려준다
export const maxDuration = 60;

// 화면이 한 번에 보내는 양 한도 (DESIGN.md §3 전송 한도)
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
  try {
    ({ hwp } = JSON.parse(raw) as { hwp: HwpDocument });
    if (!Array.isArray(hwp?.paragraphs)) throw new Error();
  } catch {
    return fail(400, "요청 형식이 올바르지 않습니다.");
  }

  try {
    return Response.json({ ok: true, findings: await checkSpelling(hwp) });
  } catch {
    return fail(502, "AI 검사 중 문제가 생겼습니다 (맞춤법 단계). 다시 시도해 주세요.");
  }
}

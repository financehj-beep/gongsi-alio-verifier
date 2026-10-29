import { checkManualRules } from "@/lib/ai/manual-check";
import { loadDefaultManual } from "@/lib/manual/load";
import type { HwpDocument } from "@/lib/readers/hwp-types";

// Design Ref: DESIGN.md §6 4단계 매뉴얼 검사 — 화면이 보낸 한글파일 글자와 현재 매뉴얼로 규칙 위반 결과를 돌려준다
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

  // 현재 매뉴얼. 매뉴얼 보관·교체(PLAN 19·20번)를 만들기 전까지는 앱에 넣어 둔 기본 매뉴얼을 쓴다.
  const loaded = await loadDefaultManual().catch(() => null);
  if (!loaded?.ok) return fail(500, loaded ? loaded.error.message : "기준 매뉴얼을 읽지 못했습니다.");

  try {
    const findings = await checkManualRules(hwp, loaded.manual);
    return Response.json({ ok: true, findings, manual: { fileName: loaded.manual.fileName } });
  } catch {
    return fail(502, "AI 검사 중 문제가 생겼습니다 (매뉴얼 단계). 다시 시도해 주세요.");
  }
}

import { TooLongError, TOO_LONG_MESSAGE } from "@/lib/ai/pool";
import { checkManualRules } from "@/lib/ai/manual-check";
import { loadCurrentManual } from "@/lib/manual/store";
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

  // 현재 매뉴얼 (보관함에서 꺼낸다. 보관함이 없으면 앱에 넣어 둔 샘플)
  const current = await loadCurrentManual().catch(() => null);
  if (!current) return fail(500, "기준 매뉴얼을 읽지 못했습니다.");
  if (!current.result.ok) return fail(500, current.result.error.message);
  const loaded = current.result;

  try {
    const findings = await checkManualRules(hwp, loaded.manual);
    return Response.json({ ok: true, findings, manual: { fileName: loaded.manual.fileName, replacedAt: current.replacedAt } });
  } catch (error) {
    if (error instanceof TooLongError) return fail(413, TOO_LONG_MESSAGE);
    return fail(502, "AI 검사 중 문제가 생겼습니다 (매뉴얼 단계). 다시 시도해 주세요.");
  }
}

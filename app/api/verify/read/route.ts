import { readWebPage } from "@/lib/readers/web";

// Design Ref: DESIGN.md §6 1단계 읽기
// 지금은 웹페이지 읽기만 한다. 한글파일·이미지 글자 읽기와 짝 확인은 PLAN.md 8~10·15번에서 이어 붙인다.
export const maxDuration = 60;

export async function POST(request: Request) {
  let url: unknown;
  try {
    ({ url } = (await request.json()) as { url?: unknown });
  } catch {
    return Response.json({ ok: false, error: { code: "invalid_url", message: "요청 형식이 올바르지 않습니다." } }, { status: 400 });
  }
  if (typeof url !== "string") {
    return Response.json({ ok: false, error: { code: "invalid_url", message: "웹페이지 주소를 넣어 주세요." } }, { status: 400 });
  }

  const result = await readWebPage(url);
  if (!result.ok) return Response.json(result, { status: 422 });
  // 읽은 글자는 저장하지 않고 화면에 돌려준다 (DESIGN.md §3 단계 사이에 글자를 넘기는 방법)
  return Response.json({ ok: true, web: result.page });
}

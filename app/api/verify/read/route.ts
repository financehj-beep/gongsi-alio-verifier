import { extensionOf } from "@/lib/limits";
import { checkPair } from "@/lib/checks/pair";
import { readWebPage } from "@/lib/readers/web";
import { readHwp } from "@/lib/readers/hwp";
import { readHwpx } from "@/lib/readers/hwpx";
import { hwpFail, type HwpReadResult } from "@/lib/readers/hwp-types";
import { attachHwpImageTexts, attachWebImageTexts } from "@/lib/readers/images";
import { cleanupOldTmpFiles } from "@/lib/storage/blob";
import { deleteTmpFile, isTmpVerifyPath, readTmpFile } from "@/lib/storage/tmp-file";

// Design Ref: DESIGN.md §6 1단계 읽기 — 웹페이지와 한글파일 글자를 뽑아 화면에 돌려준다.
// 짝 확인 결과도 함께 돌려준다. 아직 이미지 글자 읽기(PLAN.md 15번)는 없다.
export const maxDuration = 60;

function bad(message: string) {
  return Response.json({ ok: false, error: { code: "invalid_request", message } }, { status: 400 });
}

// 한글파일을 읽고, 그림 속 글자를 읽을 때 다시 쓰도록 파일 내용도 함께 돌려준다
async function readHwpFile(pathname: string): Promise<{ result: HwpReadResult; bytes?: Uint8Array }> {
  const bytes = await readTmpFile(pathname);
  if (!bytes) return { result: hwpFail("damaged") };
  if (extensionOf(pathname) === ".hwpx") return { result: await readHwpx(bytes), bytes };
  if (extensionOf(pathname) === ".hwp") return { result: await readHwp(bytes), bytes };
  return { result: hwpFail("unsupported") };
}

// 이미지 글자 읽기는 요청이 시작된 뒤 이 시간(ms)까지만 한다. Vercel 함수 제한 60초 안에 끝내기 위해 여유를 둔다.
const IMAGE_BUDGET_MS = 48_000;
// 화면으로 돌려주는 글자 한도 (Vercel 응답 한도 약 4.5MB보다 작게)
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const deadlineAt = Date.now() + IMAGE_BUDGET_MS;
  let body: { url?: unknown; pathname?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad("요청 형식이 올바르지 않습니다.");
  }
  const { url, pathname } = body;
  if (typeof url !== "string") return bad("웹페이지 주소를 넣어 주세요.");
  if (typeof pathname !== "string" || !isTmpVerifyPath(pathname)) return bad("검증할 한글파일 정보가 올바르지 않습니다.");

  // 1단계를 시작할 때도 1시간 넘은 임시 파일을 정리한다 (DESIGN.md §3)
  void cleanupOldTmpFiles().catch(() => {});

  try {
    const [web, hwpRead] = await Promise.all([readWebPage(url), readHwpFile(pathname)]);
    const hwp = hwpRead.result;
    if (!hwp.ok) return Response.json({ ok: false, error: hwp.error, side: "hwp" }, { status: 422 });
    if (!web.ok) return Response.json({ ok: false, error: web.error, side: "web" }, { status: 422 });
    // 이미지 속 글자 읽기: 웹페이지와 한글파일의 이미지를 함께 읽는다 (DESIGN.md §3 1단계 4번)
    const [webPage, hwpDoc] = await Promise.all([
      attachWebImageTexts(web.page, deadlineAt),
      hwpRead.bytes ? attachHwpImageTexts(hwp.doc, hwpRead.bytes, deadlineAt) : hwp.doc,
    ]);
    // 그림 속 글자까지 읽었는데도 글자가 하나도 없으면 비교하지 않고 멈춘다 (비교하면 상대 문장 전체가 "누락"으로 쏟아진다)
    if (hwpDoc.charCount === 0 && !hwpDoc.imageTexts?.length) return Response.json({ ok: false, error: hwpFail("empty").error, side: "hwp" }, { status: 422 });
    if (webPage.charCount < 20 && !webPage.imageTexts?.length) {
      return Response.json({ ok: false, error: { code: "empty", message: "웹페이지에서 공고 본문을 찾지 못했습니다. URL이 공고 상세 페이지인지 확인해 주세요." }, side: "web" }, { status: 422 });
    }
    // 읽은 글자는 저장하지 않고 화면에 돌려준다 (DESIGN.md §3 단계 사이에 글자를 넘기는 방법)
    const payload = JSON.stringify({ ok: true, web: webPage, hwp: hwpDoc, pair: checkPair(hwpDoc, webPage) });
    if (new TextEncoder().encode(payload).byteLength > MAX_RESPONSE_BYTES) {
      return Response.json({ ok: false, error: { code: "too_long", message: "문서 글자가 너무 많아 검증할 수 없습니다. 부점에 내용을 나눈 파일을 요청해 주세요." } }, { status: 413 });
    }
    return new Response(payload, { headers: { "Content-Type": "application/json" } });
  } catch {
    return Response.json(
      { ok: false, error: { code: "unknown", message: "파일을 읽는 중 문제가 생겼습니다. 다시 시도해 주세요." } },
      { status: 500 },
    );
  } finally {
    // 읽기가 끝나면 오류가 나도 임시 한글파일을 바로 지운다
    await deleteTmpFile(pathname);
  }
}

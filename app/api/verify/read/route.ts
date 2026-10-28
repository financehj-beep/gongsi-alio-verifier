import { extensionOf } from "@/lib/limits";
import { readWebPage } from "@/lib/readers/web";
import { readHwpx } from "@/lib/readers/hwpx";
import { hwpFail, type HwpReadResult } from "@/lib/readers/hwp-types";
import { cleanupOldTmpFiles } from "@/lib/storage/blob";
import { deleteTmpFile, isTmpVerifyPath, readTmpFile } from "@/lib/storage/tmp-file";

// Design Ref: DESIGN.md §6 1단계 읽기 — 웹페이지와 한글파일 글자를 뽑아 화면에 돌려준다.
// 아직 .hwp 읽기(PLAN.md 9번), 짝 확인(10번), 이미지 글자 읽기(15번)는 없다.
export const maxDuration = 60;

function bad(message: string) {
  return Response.json({ ok: false, error: { code: "invalid_request", message } }, { status: 400 });
}

async function readHwpFile(pathname: string): Promise<HwpReadResult> {
  const bytes = await readTmpFile(pathname);
  if (!bytes) return hwpFail("damaged");
  if (extensionOf(pathname) === ".hwpx") return readHwpx(bytes);
  return hwpFail("unsupported");
}

export async function POST(request: Request) {
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
    const [web, hwp] = await Promise.all([readWebPage(url), readHwpFile(pathname)]);
    if (!hwp.ok) return Response.json({ ok: false, error: hwp.error, side: "hwp" }, { status: 422 });
    if (!web.ok) return Response.json({ ok: false, error: web.error, side: "web" }, { status: 422 });
    // 읽은 글자는 저장하지 않고 화면에 돌려준다 (DESIGN.md §3 단계 사이에 글자를 넘기는 방법)
    return Response.json({ ok: true, web: web.page, hwp: hwp.doc });
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

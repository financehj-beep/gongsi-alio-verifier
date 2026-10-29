import path from "node:path";
import { extensionOf } from "@/lib/limits";
import { confirmReplace, deleteUpload, isManualUploadPath, readUploadedManual } from "@/lib/manual/store";
import { hasBlobToken } from "@/lib/storage/blob";

// Design Ref: DESIGN.md §6 매뉴얼 미리보기·교체 확정·교체 취소
// 읽지 못한 파일, 취소한 파일은 올린 즉시 지운다 (DESIGN.md §3 매뉴얼 교체 흐름)
type Body = { action?: string; pathname?: string; fileName?: string };

function fail(status: number, message: string) {
  return Response.json({ ok: false, error: { message } }, { status });
}

export async function POST(request: Request) {
  if (!hasBlobToken()) return fail(503, "파일 보관함이 아직 연결되지 않았습니다.");

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail(400, "요청 형식이 올바르지 않습니다.");
  }
  const { action, pathname } = body;
  // 올린 파일 이름에서 폴더 부분은 버린다
  const fileName = path.basename(body.fileName ?? "");
  if (!pathname || !isManualUploadPath(pathname)) return fail(400, "허용되지 않은 저장 위치입니다.");

  if (action === "cancel") {
    await deleteUpload(pathname);
    return Response.json({ ok: true });
  }

  if ((action !== "preview" && action !== "confirm") || !fileName || extensionOf(fileName) !== extensionOf(pathname)) {
    return fail(400, "요청 형식이 올바르지 않습니다.");
  }

  try {
    const read = await readUploadedManual(pathname, fileName);
    if (!read) {
      await deleteUpload(pathname);
      return fail(422, "올린 매뉴얼 파일을 찾지 못했거나 20MB를 넘습니다. 다시 올려 주세요.");
    }
    if (!read.result.ok) {
      await deleteUpload(pathname);
      return fail(422, read.result.error.message);
    }
    const { manual } = read.result;
    if (action === "preview") {
      return Response.json({
        ok: true,
        preview: { fileName, pageCount: manual.pageCount, pageKnown: manual.pageKnown, clauseCount: manual.clauses.length },
      });
    }
    const version = await confirmReplace(fileName, read.bytes, manual);
    await deleteUpload(pathname);
    return Response.json({ ok: true, version });
  } catch {
    // 예상 못 한 오류가 나도 올린 파일은 남기지 않는다
    if (action === "preview") await deleteUpload(pathname);
    return fail(500, "매뉴얼을 처리하지 못했습니다. 현재 매뉴얼은 그대로입니다. 잠시 후 다시 시도해 주세요.");
  }
}

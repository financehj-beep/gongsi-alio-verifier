import { readFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import { loadDefaultManual, readManualFile } from "@/lib/manual/load";
import type { ManualReadResult } from "@/lib/manual/types";

// Design Ref: DESIGN.md §6 — 앱에 미리 넣어 둔 기본 매뉴얼의 요약만 돌려준다.
// 매뉴얼 원문(조항 내용)은 화면에 보내지 않는다.
// 개발 중에만 ?debug=1 로 조항을 보고, &file=파일이름 으로 data/sample-manual 안의 다른 샘플 파일도 시험할 수 있다.
export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const debug = process.env.NODE_ENV !== "production" && params.get("debug") === "1";

  try {
    let result: ManualReadResult;
    const file = debug ? params.get("file") : null;
    if (file) {
      // 폴더 밖 파일은 열지 않는다
      const name = path.basename(file);
      const bytes = await readFile(path.join(process.cwd(), "data", "sample-manual", name));
      result = await readManualFile(name, new Uint8Array(bytes));
    } else {
      result = await loadDefaultManual();
    }

    if (!result.ok) return Response.json(result, { status: 422 });
    const { manual } = result;
    const summary = {
      fileName: manual.fileName,
      format: manual.format,
      pageCount: manual.pageCount,
      pageKnown: manual.pageKnown,
      clauseCount: manual.clauses.length,
      structured: manual.structured,
    };
    return Response.json({ ok: true, manual: summary, ...(debug ? { clauses: manual.clauses } : {}) });
  } catch {
    return Response.json({ ok: false, error: { message: "기본 매뉴얼을 읽지 못했습니다." } }, { status: 500 });
  }
}

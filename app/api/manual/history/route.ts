import { connection } from "next/server";
import { hasBlobToken } from "@/lib/storage/blob";
import { readHistory, toPublic } from "@/lib/manual/store";

// Design Ref: DESIGN.md §6 매뉴얼 이력 보기 — 이력 목록(저장 위치 제외)만 돌려준다
export async function GET() {
  await connection();
  if (!hasBlobToken()) {
    return Response.json({ ok: false, error: { message: "파일 보관함이 아직 연결되지 않았습니다." } }, { status: 503 });
  }
  try {
    return Response.json({ ok: true, versions: toPublic(await readHistory()) });
  } catch {
    return Response.json({ ok: false, error: { message: "매뉴얼 이력을 불러오지 못했습니다." } }, { status: 500 });
  }
}

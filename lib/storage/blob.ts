import "server-only";
import { del, list } from "@vercel/blob";
import { MANUAL_PREFIX, TMP_PREFIX } from "@/lib/limits";

const ONE_HOUR_MS = 60 * 60 * 1000;

// 보관함 열쇠(.env의 BLOB_READ_WRITE_TOKEN)가 있는지
export function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

// Design Ref: DESIGN.md §3 남은 임시 파일 정리 — 1시간 넘은 임시 파일만 지운다.
// 지우는 곳은 tmp/(검증용 한글파일)와 manuals/uploads/(교체하려고 올렸다가 확정·취소하지 않은 새 매뉴얼)뿐이고,
// 보관 중인 매뉴얼(manuals/v숫자/)과 이력 파일은 절대 건드리지 않는다.
const CLEANUP_PREFIXES = [TMP_PREFIX, `${MANUAL_PREFIX}uploads/`];

export async function cleanupOldTmpFiles(now = Date.now()): Promise<void> {
  for (const prefix of CLEANUP_PREFIXES) {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor });
      const old = page.blobs
        .filter((blob) => blob.pathname.startsWith(prefix))
        .filter((blob) => now - new Date(blob.uploadedAt).getTime() > ONE_HOUR_MS)
        .map((blob) => blob.url);
      if (old.length > 0) await del(old);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }
}

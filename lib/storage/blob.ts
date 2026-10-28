import "server-only";
import { del, list } from "@vercel/blob";
import { TMP_PREFIX } from "@/lib/limits";

const ONE_HOUR_MS = 60 * 60 * 1000;

// 보관함 열쇠(.env의 BLOB_READ_WRITE_TOKEN)가 있는지
export function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

// Design Ref: DESIGN.md §3 남은 임시 파일 정리 — tmp/ 폴더만 지우고 manuals/는 절대 건드리지 않는다
export async function cleanupOldTmpFiles(now = Date.now()): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: TMP_PREFIX, cursor });
    const old = page.blobs
      .filter((blob) => blob.pathname.startsWith(TMP_PREFIX))
      .filter((blob) => now - new Date(blob.uploadedAt).getTime() > ONE_HOUR_MS)
      .map((blob) => blob.url);
    if (old.length > 0) await del(old);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

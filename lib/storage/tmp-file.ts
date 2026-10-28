import "server-only";
import { del, get } from "@vercel/blob";
import { MAX_FILE_BYTES, TMP_PREFIX, VERIFY_EXTENSIONS, extensionOf } from "@/lib/limits";

// 임시 폴더(tmp/)에 올라온 검증용 한글파일을 꺼내고, 다 쓰면 지운다 (DESIGN.md §3 1단계 6번)

export function isTmpVerifyPath(pathname: string): boolean {
  return (
    pathname.startsWith(TMP_PREFIX) &&
    !pathname.includes("..") &&
    (VERIFY_EXTENSIONS as readonly string[]).includes(extensionOf(pathname))
  );
}

export async function readTmpFile(pathname: string): Promise<Uint8Array | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  // 허가 단계에서 막지만, 서버에서도 한 번 더 용량을 확인한다
  return bytes.byteLength > MAX_FILE_BYTES ? null : bytes;
}

export async function deleteTmpFile(pathname: string): Promise<void> {
  try {
    await del(pathname);
  } catch {
    // 지우기에 실패해도 1시간 뒤 정리 작업이 지운다
  }
}

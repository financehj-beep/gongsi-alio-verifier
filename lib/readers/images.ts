import "server-only";
import { readHwpImageBytes } from "@/lib/readers/hwp";
import { readHwpxImageBytes } from "@/lib/readers/hwpx";
import type { HwpDocument } from "@/lib/readers/hwp-types";
import { type WebPage } from "@/lib/readers/web";
import { readLimited, safeFetch } from "@/lib/security/safe-fetch";
import { readImageTexts, type ImageInput } from "@/lib/ai/image-text";

// Design Ref: DESIGN.md §3 1단계 읽기 4번 — 웹페이지와 한글파일의 이미지를 모아 글자를 읽고, 읽은 결과를 각 문서에 붙인다.

const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

async function downloadWebImage(src: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  try {
    const safe = new URL(src);
    const res = await safeFetch(safe, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "Mozilla/5.0", Referer: safe.origin } });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!OK_TYPES.includes(mime)) return null;
    // 한도를 넘는 이미지는 받는 도중에 멈춘다
    const bytes = await readLimited(res, MAX_IMAGE_BYTES);
    return bytes ? { mime, bytes } : null;
  } catch {
    return null;
  }
}

// 웹페이지 이미지 속 글자를 읽어 page에 붙인다. 내려받지 못한 이미지는 읽지 못한 것으로 센다.
export async function attachWebImageTexts(page: WebPage, deadlineAt?: number): Promise<WebPage> {
  if (page.images.length === 0) return page;
  const downloaded = await Promise.all(page.images.map(async (img) => ({ img, file: await downloadWebImage(img.src) })));
  const inputs: ImageInput[] = downloaded.flatMap(({ img, file }) => (file ? [{ side: "웹페이지" as const, index: img.index, ...file }] : []));
  const { texts, stats } = await readImageTexts(inputs, deadlineAt);
  // 작은 이미지는 읽지 않으므로 total은 실제로 읽으려던 장수이고, 내려받지 못한 것은 실패에 더한다
  const downloadFailed = downloaded.filter((d) => !d.file).length;
  return { ...page, imageTexts: texts, imageStats: { total: stats.total + downloadFailed, failed: stats.failed + downloadFailed } };
}

const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

// 한글파일 그림 속 글자를 읽어 doc에 붙인다
export async function attachHwpImageTexts(doc: HwpDocument, fileBytes: Uint8Array, deadlineAt?: number): Promise<HwpDocument> {
  if (doc.images.length === 0) return doc;
  const inputs: ImageInput[] = [];
  for (const img of doc.images) {
    const mime = img.mime in MIME_BY_EXT ? MIME_BY_EXT[img.mime] : img.mime;
    if (!OK_TYPES.includes(mime)) continue;
    const bytes = doc.format === "hwp" ? await readHwpImageBytes(fileBytes, img.path) : await readHwpxImageBytes(fileBytes, img.path);
    if (bytes) inputs.push({ side: "한글파일", index: img.index, mime, bytes });
  }
  const { texts, stats } = await readImageTexts(inputs, deadlineAt);
  return { ...doc, imageTexts: texts, imageStats: stats };
}

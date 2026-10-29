import "server-only";
import { del, get, put } from "@vercel/blob";
import { MANUAL_PREFIX, MAX_FILE_BYTES, extensionOf } from "@/lib/limits";
import { hasBlobToken } from "@/lib/storage/blob";
import { loadDefaultManual, readManualFile } from "@/lib/manual/load";
import type { ManualDoc, ManualReadResult } from "@/lib/manual/types";
import type { ManualVersion, PublicManualVersion } from "@/lib/types";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Design Ref: DESIGN.md §3 매뉴얼 이력 보관 방법 — manuals/ 폴더에 원본·뽑아둔 글자·목록 파일(manual-history.json)을 둔다.
// 저장 위치(storage)는 서버 안에서만 쓰고 화면에는 보내지 않는다.

const HISTORY_PATH = `${MANUAL_PREFIX}manual-history.json`;
export const UPLOAD_PREFIX = `${MANUAL_PREFIX}uploads/`;

export function isManualUploadPath(pathname: string): boolean {
  return pathname.startsWith(UPLOAD_PREFIX) && !pathname.includes("..") && [".hwp", ".hwpx", ".pdf"].includes(extensionOf(pathname));
}

async function getBytes(pathname: string): Promise<Uint8Array | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}

export async function readUpload(pathname: string): Promise<Uint8Array | null> {
  const bytes = await getBytes(pathname);
  return bytes && bytes.byteLength <= MAX_FILE_BYTES ? bytes : null;
}

export async function deleteUpload(pathname: string): Promise<void> {
  try {
    await del(pathname);
  } catch {
    // 지우기에 실패해도 매뉴얼 이력에는 영향이 없다
  }
}

async function writeHistory(history: ManualVersion[]) {
  await put(HISTORY_PATH, JSON.stringify(history), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function saveVersion(history: ManualVersion[], fileName: string, original: Uint8Array, manual: ManualDoc): Promise<ManualVersion[]> {
  const version = history.reduce((max, v) => Math.max(max, v.version), 0) + 1;
  const originalPath = `${MANUAL_PREFIX}v${version}/original${extensionOf(fileName)}`;
  const textPath = `${MANUAL_PREFIX}v${version}/text.json`;
  await put(originalPath, Buffer.from(original), { access: "private", addRandomSuffix: false, allowOverwrite: true });
  await put(textPath, JSON.stringify(manual), { access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
  const entry: ManualVersion = {
    version,
    fileName,
    pageCount: manual.pageCount,
    clauseCount: manual.clauses.length,
    replacedAt: new Date().toISOString(),
    isCurrent: true,
    storage: { originalPath, textPath },
  };
  // 목록 파일을 마지막에 바꾼다: 중간에 실패해도 현재 매뉴얼은 그대로다
  const next = [...history.map((v) => ({ ...v, isCurrent: false })), entry];
  await writeHistory(next);
  return next;
}

// 이력을 읽는다. 목록 파일이 없으면 실습용 샘플 매뉴얼을 v1(현재)로 등록한다.
export async function readHistory(): Promise<ManualVersion[]> {
  const bytes = await getBytes(HISTORY_PATH);
  if (bytes) return JSON.parse(new TextDecoder().decode(bytes)) as ManualVersion[];
  const loaded = await loadDefaultManual();
  if (!loaded.ok) throw new Error(loaded.error.message);
  const name = "sample-manual.pdf";
  const original = new Uint8Array(await readFile(path.join(process.cwd(), "data", "sample-manual", name)));
  return saveVersion([], name, original, loaded.manual);
}

export const toPublic = (history: ManualVersion[]): PublicManualVersion[] =>
  history
    .map((v): PublicManualVersion => ({
      version: v.version,
      fileName: v.fileName,
      pageCount: v.pageCount,
      clauseCount: v.clauseCount,
      replacedAt: v.replacedAt,
      isCurrent: v.isCurrent,
    }))
    .sort((a, b) => b.version - a.version);

// 검증에 쓸 현재 매뉴얼. 보관함이 없으면 앱에 넣어 둔 샘플 매뉴얼을 쓴다.
export async function loadCurrentManual(): Promise<{ result: ManualReadResult; replacedAt?: string }> {
  if (!hasBlobToken()) return { result: await loadDefaultManual() };
  const history = await readHistory();
  const current = history.find((v) => v.isCurrent);
  const bytes = current ? await getBytes(current.storage.textPath) : null;
  if (!current || !bytes) throw new Error("현재 매뉴얼을 꺼내지 못했습니다.");
  return { result: { ok: true, manual: JSON.parse(new TextDecoder().decode(bytes)) as ManualDoc }, replacedAt: current.replacedAt };
}

// 올린 새 매뉴얼을 읽어 본다 (미리보기·확정이 함께 쓴다)
export async function readUploadedManual(pathname: string, fileName: string) {
  const bytes = await readUpload(pathname);
  if (!bytes) return null;
  return { bytes, result: await readManualFile(fileName, bytes) };
}

export async function confirmReplace(fileName: string, bytes: Uint8Array, manual: ManualDoc): Promise<PublicManualVersion> {
  const history = await readHistory();
  const next = await saveVersion(history, fileName, bytes, manual);
  return toPublic(next)[0];
}

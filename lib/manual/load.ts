import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MANUAL_EXTENSIONS, MAX_FILE_BYTES, extensionOf } from "@/lib/limits";
import { parseManualLines, type ManualLine } from "@/lib/manual/parse";
import { manualFail, type ManualReadResult } from "@/lib/manual/types";
import { readHwp } from "@/lib/readers/hwp";
import { readHwpx } from "@/lib/readers/hwpx";
import { readPdfLines } from "@/lib/readers/pdf";

// Design Ref: DESIGN.md §3 매뉴얼 — .hwpx·PDF 매뉴얼에서 글자를 조항·쪽 정보와 함께 꺼낸다.
// 매뉴얼 원문은 서버 안에서만 쓰고 화면에는 보내지 않는다 (DESIGN.md §1 지키는 원칙).

// 글자(한글·영문·숫자)가 이 정도도 없으면 글자 없는 파일로 본다
const MIN_LETTERS = 20;

function finish(
  fileName: string,
  format: "pdf" | "hwp" | "hwpx",
  lines: ManualLine[],
  pageCount: number | undefined,
  pageKnown: boolean,
): ManualReadResult {
  const letters = lines.reduce((n, l) => n + (l.text.match(/[\p{L}\p{N}]/gu)?.length ?? 0), 0);
  if (letters < MIN_LETTERS) return manualFail("empty");
  const { clauses, structured } = parseManualLines(lines);
  const charCount = lines.reduce((n, l) => n + l.text.length, 0);
  return { ok: true, manual: { fileName, format, clauses, structured, pageKnown, pageCount, charCount } };
}

export async function readManualFile(fileName: string, bytes: Uint8Array): Promise<ManualReadResult> {
  const ext = extensionOf(fileName);
  if (!(MANUAL_EXTENSIONS as readonly string[]).includes(ext)) return manualFail("format");
  if (bytes.byteLength > MAX_FILE_BYTES) return manualFail("size");

  if (ext === ".pdf") {
    const pdf = await readPdfLines(bytes);
    if (!pdf.ok) return pdf;
    return finish(fileName, "pdf", pdf.lines, pdf.pageCount, true);
  }

  if (ext === ".hwpx" || ext === ".hwp") {
    const hwp = ext === ".hwp" ? await readHwp(bytes) : await readHwpx(bytes);
    if (!hwp.ok) {
      // 한글파일 읽기의 오류를 매뉴얼 안내 문구로 바꾼다
      const code = hwp.error.code;
      return manualFail(code === "encrypted" ? "encrypted" : code === "distribution" ? "distribution" : code === "empty" ? "empty" : "damaged");
    }
    const lines = hwp.doc.paragraphs.flatMap((p) => p.text.split("\n").map((text) => ({ text, page: p.location.page })));
    return finish(fileName, ext === ".hwp" ? "hwp" : "hwpx", lines, hwp.doc.pageCount, hwp.doc.pageKnown);
  }

  return manualFail("unsupported");
}

// 앱 안에 미리 넣어 둔 실습용 샘플 매뉴얼. 비공개인 실제 매뉴얼은 코드에 넣지 않고 매뉴얼 관리 화면으로 올린다 (DESIGN.md §4.3).
const DEFAULT_FILE = "sample-manual.pdf";
let defaultCache: ManualReadResult | null = null;

export async function loadDefaultManual(): Promise<ManualReadResult> {
  if (defaultCache?.ok) return defaultCache;
  const bytes = await readFile(path.join(process.cwd(), "data", "sample-manual", DEFAULT_FILE));
  defaultCache = await readManualFile(DEFAULT_FILE, new Uint8Array(bytes));
  return defaultCache;
}

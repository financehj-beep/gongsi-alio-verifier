import "server-only";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import type { ManualLine } from "@/lib/manual/parse";
import { manualFail } from "@/lib/manual/types";

// Design Ref: DESIGN.md §4.2 unpdf — PDF 매뉴얼에서 글자를 쪽 번호와 함께 꺼낸다.
// 한글 PDF는 글자 변환표(cmaps)가 있어야 읽히는 경우가 많아, pdfjs-dist의 변환표 폴더를 알려준다.

const CMAP_URL = `${path.join(process.cwd(), "node_modules/pdfjs-dist/cmaps")}/`;

export type PdfRead = { ok: true; lines: ManualLine[]; pageCount: number } | ReturnType<typeof manualFail>;

export async function readPdfLines(bytes: Uint8Array): Promise<PdfRead> {
  try {
    // pdf.js가 받은 배열을 가져가 버리므로 복사본을 넘긴다
    const pdf = await getDocumentProxy(new Uint8Array(bytes), { cMapUrl: CMAP_URL, cMapPacked: true, verbosity: 0 });
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const lines: ManualLine[] = [];
    text.forEach((pageText, i) => {
      for (const line of pageText.split("\n")) lines.push({ text: line, page: i + 1 });
    });
    return { ok: true, lines, pageCount: totalPages };
  } catch (error) {
    const name = (error as { name?: string }).name ?? "";
    // 암호가 걸린 PDF는 암호 오류로, 나머지는 손상된 파일로 안내한다
    return manualFail(/Password/i.test(name) ? "encrypted" : "damaged");
  }
}

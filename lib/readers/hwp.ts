import "server-only";
import { parse } from "hwp.js";
import * as CFB from "cfb";
import type { HwpLocation } from "@/lib/types";
import { hwpFail, type HwpParagraph, type HwpReadResult } from "@/lib/readers/hwp-types";

// Design Ref: DESIGN.md §4.2 hwp.js — 예전 형식 한글파일(.hwp)에서 글자를 쪽·문단·표 위치와 함께 뽑는다.
// .hwp는 여러 칸으로 나뉜 보관 파일이고, 맨 앞 FileHeader에 "암호 / 배포용 문서" 표시가 들어 있다.

type HwpJsParagraph = {
  content: { type: number; value: number | string }[];
  controls?: unknown[];
  lineSegments?: { y: number }[];
};
type HwpJsTable = { rowCount: number; content: { attribute: { row: number; column: number }; items: HwpJsParagraph[] }[][] };

// 같은 쪽 안에서는 세로 위치(y)가 커지기만 하므로, 작아지면 새 쪽으로 본다 (.hwpx와 같은 방식)
const isTable = (c: unknown): c is HwpJsTable => !!c && typeof c === "object" && "rowCount" in c && "content" in c;

function clean(text: string): string {
  return text
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

// 문단 하나의 글자. 글자(Char)만 모으고 표·그림 자리표시는 건너뛴다.
const textOf = (p: HwpJsParagraph) =>
  p.content
    .filter((c) => c.type === 0 && typeof c.value === "string")
    .map((c) => c.value as string)
    .join("");

// 파일 머리말의 표시를 읽는다: 비트1 = 암호, 비트2 = 배포용 문서
function readFlags(bytes: Uint8Array): { encrypted: boolean; distribution: boolean } | null {
  try {
    const entry = CFB.find(CFB.read(bytes, { type: "buffer" }), "/FileHeader");
    const content = entry?.content;
    if (!content || content.length < 40) return null;
    const flags = new DataView(new Uint8Array(content).buffer).getUint32(36, true);
    return { encrypted: (flags & 0b10) !== 0, distribution: (flags & 0b100) !== 0 };
  } catch {
    return null;
  }
}

export async function readHwp(bytes: Uint8Array): Promise<HwpReadResult> {
  const flags = readFlags(bytes);
  if (!flags) return hwpFail("damaged");
  if (flags.encrypted) return hwpFail("encrypted");
  if (flags.distribution) return hwpFail("distribution");

  let doc: ReturnType<typeof parse>;
  try {
    doc = parse(Buffer.from(bytes), { type: "buffer" });
  } catch {
    return hwpFail("damaged");
  }

  const paragraphs: HwpParagraph[] = [];
  let page = 1;
  let paraInPage = 0;
  let lastY = -1;
  let tableIndex = 0;
  let pageKnown = false;

  // 표 안의 글자를 칸(행·열) 위치와 함께 모은다. 칸 안의 표도 같은 칸으로 본다.
  const cellTexts = (items: HwpJsParagraph[]): string[] =>
    items.flatMap((p) => [textOf(p), ...(p.controls ?? []).filter(isTable).flatMap((t) => t.content.flat().flatMap((cell) => cellTexts(cell.items)))]);

  (doc.sections as unknown as { content: HwpJsParagraph[] }[]).forEach((section, s) => {
    if (s > 0) {
      page += 1;
      paraInPage = 0;
      lastY = -1;
    }
    for (const p of section.content) {
      const ys = (p.lineSegments ?? []).map((l) => l.y);
      if (ys.length > 0) pageKnown = true;
      if (ys.length > 0 && lastY >= 0 && ys[0] < lastY) {
        page += 1;
        paraInPage = 0;
      }
      if (ys.length > 0) lastY = Math.max(...ys);
      paraInPage += 1;
      const here = (): Omit<HwpLocation, "table"> => ({ page, paragraph: paraInPage });

      const text = clean(textOf(p));
      if (text) paragraphs.push({ text, location: here() });

      for (const control of p.controls ?? []) {
        if (!isTable(control)) continue;
        tableIndex += 1;
        for (const row of control.content) {
          for (const cell of row) {
            const cellText = clean(cellTexts(cell.items).join("\n"));
            if (!cellText) continue;
            paragraphs.push({
              text: cellText,
              location: { ...here(), table: { index: tableIndex, row: cell.attribute.row + 1, col: cell.attribute.column + 1 } },
            });
          }
        }
      }
    }
  });

  const charCount = paragraphs.reduce((n, p) => n + p.text.length, 0);
  if (charCount === 0) return hwpFail("empty");

  // 쪽 정보가 없으면 쪽 번호를 버리고 전체 문단 순서만 남긴다 (PRD.md 4번)
  if (!pageKnown) {
    let n = 0;
    let lastKey = "";
    for (const para of paragraphs) {
      const key = `${para.location.page}-${para.location.paragraph}`;
      if (key !== lastKey) n += 1;
      lastKey = key;
      para.location = { paragraph: n, ...(para.location.table ? { table: para.location.table } : {}) };
    }
  }

  // 그림 속 글자 읽기는 PLAN.md 15번에서 .hwp까지 함께 붙인다
  return { ok: true, doc: { format: "hwp", paragraphs, images: [], pageKnown, pageCount: pageKnown ? page : undefined, charCount } };
}

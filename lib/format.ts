import type { Finding, HwpLocation, ImageLocation, WebLocation } from "@/lib/types";

// 결과 카드에 보여줄 위치 글자 (PRD.md 4번 "위치" 표시 기준)

export function formatHwpLocation(loc: HwpLocation): string {
  const parts: string[] = [];
  // 쪽 번호를 모르면 "○번째 문단"으로만 표시한다
  if (loc.page) parts.push(`${loc.page}쪽`);
  if (loc.table) {
    parts.push(`표 ${loc.table.index} ${loc.table.row}행 ${loc.table.col}열`);
  } else {
    parts.push(loc.page ? `${loc.paragraph}문단` : `${loc.paragraph}번째 문단`);
  }
  return `한글파일 ${parts.join(" ")}`;
}

export function formatWebLocation(loc: WebLocation): string {
  // sentence가 0이면 소제목 그 자체
  if (loc.sentence === 0) return `웹 소제목 "${loc.heading}"`;
  return loc.heading ? `웹 "${loc.heading}" ${loc.sentence}번째 문장` : `웹 ${loc.sentence}번째 문장`;
}

export function formatImageLocation(loc: ImageLocation): string {
  return `${loc.side} ${loc.index}번째 이미지 · ${loc.area}`;
}

export function formatLocations(f: Finding): string[] {
  const out: string[] = [];
  if (f.imageLocation) out.push(formatImageLocation(f.imageLocation));
  if (f.hwpLocation) out.push(formatHwpLocation(f.hwpLocation));
  if (f.webLocation) out.push(formatWebLocation(f.webLocation));
  return out;
}

export type Piece = { text: string; changed: boolean };

// 띄어쓰기를 살린 채 단어 단위로 자른다 ("모집인원 1,500명" → ["모집인원", " ", "1,500명"])
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

// 두 문장에서 다른 단어를 찾아, 한글파일 쪽과 웹페이지 쪽에 각각 강조할 조각으로 나눈다.
// 숫자는 일부 글자만 강조하면 헷갈리므로 단어 전체를 강조한다 (예: "1,500명" ↔ "1,050명").
export function highlightPair(hwp: string, web: string): { hwp: Piece[]; web: Piece[] } {
  const a = tokenize(hwp);
  const b = tokenize(web);
  // 가장 긴 공통 부분(LCS)을 표로 계산한다. 한 문장은 짧아서 이 방식으로 충분하다.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const hwpPieces: Piece[] = [];
  const webPieces: Piece[] = [];
  const push = (list: Piece[], text: string, changed: boolean) => {
    const last = list[list.length - 1];
    if (last && last.changed === changed) last.text += text;
    else list.push({ text, changed });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(hwpPieces, a[i++], false);
      push(webPieces, b[j++], false);
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push(hwpPieces, a[i++], true);
    } else {
      push(webPieces, b[j++], true);
    }
  }
  while (i < a.length) push(hwpPieces, a[i++], true);
  while (j < b.length) push(webPieces, b[j++], true);

  // 띄어쓰기만 강조된 조각은 강조하지 않는다
  const unmarkSpaces = (list: Piece[]) => list.map((p) => (p.changed && !p.text.trim() ? { ...p, changed: false } : p));
  return { hwp: unmarkSpaces(hwpPieces), web: unmarkSpaces(webPieces) };
}

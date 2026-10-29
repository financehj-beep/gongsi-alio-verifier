import type { ManualClause } from "@/lib/manual/types";

// 매뉴얼의 줄들을 조항으로 나눈다. 조항 번호 모양을 알아보면 그 번호로, 못 알아보면 문단 순서로 나눈다.
// 규칙 위반 결과에 "어느 조항(페이지·항목 번호)을 어겼는지" 적기 위한 준비다 (PRD.md 5번 must 2).

export type ManualLine = { text: string; page?: number };

// 제3장 채용공시
const CHAPTER = /^제\s*(\d+)\s*장\s*(.*)$/;
// 제5조(목적) 내용 / 제5조 내용
const ARTICLE = /^제\s*(\d+)\s*조(?:\s*(?:의\s*\d+)?)?\s*(?:\(([^)]*)\))?\s*(.*)$/;
// 3.1 내용 / 3.1.2 내용. 날짜(2026.11.03)가 항 번호로 읽히지 않게 앞자리는 1~2자리만 받는다.
const ITEM = /^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\s*[.)]?\s+(.*)$/;

export type ParsedManual = { clauses: ManualClause[]; structured: boolean };

export function parseManualLines(lines: ManualLine[]): ParsedManual {
  const clauses: ManualClause[] = [];
  let chapterNo: string | undefined;
  let chapterTitle: string | undefined;
  let current: ManualClause | null = null;

  const push = (clause: ManualClause) => {
    current = clause;
    clauses.push(clause);
  };

  for (const { text: raw, page } of lines) {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) continue;

    const chapter = CHAPTER.exec(text);
    if (chapter) {
      chapterNo = chapter[1];
      chapterTitle = `제${chapter[1]}장 ${chapter[2]}`.trim();
      current = null;
      continue;
    }

    const article = ARTICLE.exec(text);
    if (article) {
      const [, no, title, rest] = article;
      push({
        label: `제${no}조`,
        chapter: chapterTitle,
        number: `제${no}조`,
        text: [title ? `(${title})` : "", rest].filter(Boolean).join(" "),
        page,
      });
      continue;
    }

    const item = ITEM.exec(text);
    if (item) {
      const [, number, rest] = item;
      const chapterLabel = chapterNo ?? number.split(".")[0];
      push({ label: `제${chapterLabel}장 ${number}항`, chapter: chapterTitle, number, text: rest, page });
      continue;
    }

    // 조항 번호가 없는 줄은 앞 조항에 이어 붙인다 (긴 조항이 여러 줄로 나뉜 경우)
    if (current) (current as ManualClause).text += ` ${text}`;
  }

  if (clauses.length > 0) return { clauses, structured: true };

  // 조항 번호를 하나도 알아보지 못하면 문단 순서로 나눈다
  const fallback: ManualClause[] = [];
  for (const { text: raw, page } of lines) {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) continue;
    fallback.push({ label: `문단 ${fallback.length + 1}`, number: String(fallback.length + 1), text, page });
  }
  return { clauses: fallback, structured: false };
}

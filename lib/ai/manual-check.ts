import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAI, modelName, reasoningOption } from "@/lib/ai/client";
import type { ManualClause, ManualDoc } from "@/lib/manual/types";
import type { HwpDocument } from "@/lib/readers/hwp-types";
import type { Finding } from "@/lib/types";

// Design Ref: DESIGN.md §3 4단계 매뉴얼 검사 — 매뉴얼 조항만 근거로 한 위반을 조항 번호·원문 인용과 함께 받는다.
// PRD.md 5번 must 2: 규칙 위반은 매뉴얼 조항만 근거로 하고, 조항 번호와 원문 인용을 붙인다.

type HItem = { id: string; text: string; index: number; inTable: boolean };

const CHUNK_CHARS = 5000;
// 한 번에 보내는 매뉴얼 글자 한도. 이보다 길면 한글파일 조각과 관련 있는 조항만 골라 보낸다 (DESIGN.md §3 AI 입력 한도)
const MANUAL_CHARS = 40000;

const AnswerSchema = z.object({
  violations: z.array(
    z.object({
      h: z.string().describe("위반한 문장 번호 (예: H3). 필요한 내용이 문서 어디에도 없는 경우에는 빈 문자열"),
      clause: z.string().describe("어긴 매뉴얼 조항 번호 (예: M5)"),
      quote: z.string().describe("그 조항 안에 실제로 있는 문장을 글자 그대로 인용"),
      reason: z.string().describe("어떻게 어겼는지 한국어 한 문장"),
    }),
  ),
});

const INSTRUCTIONS = `너는 공공기관 공시 문서가 공시 매뉴얼 규칙을 지켰는지 검사한다.
입력에는 [매뉴얼 조항] M…과 [검사할 문서] H… 두 부분이 있다.

규칙:
1. 근거는 입력의 매뉴얼 조항(M…)뿐이다. 매뉴얼에 없는 규칙, 일반 상식, 네 의견으로 위반을 만들지 않는다.
2. 문서(H…)가 조항의 내용과 분명히 어긋날 때만 위반으로 적는다. 조항과 관계없는 문장, 어긋나는지 애매한 문장은 적지 않는다.
   날짜·금액·인원 같은 표기 형식을 정한 조항은, 문서의 표기 모양이 조항이 정한 모양과 다르면 위반이다 (예: 조항이 2026.11.03 형식인데 문서가 2026-11-03).
   "(표 안)"이 붙은 문장은 표 안의 글자다. 표로 정리하라는 조항은 이미 표 안에 있으면 지킨 것이다.
3. 조항의 "예:" 부분은 설명용 예시일 뿐이다. 예시와 다르다는 이유만으로 위반으로 보지 않는다.
4. 문서에 반드시 들어가야 하는 내용이 조항에 정해져 있는데 [검사할 문서]에 그 내용이 전혀 없을 때만 h를 빈 문자열로 두고 위반으로 적는다. 있는지 애매하면 적지 않는다.
5. 맞춤법 오류, 숫자·날짜가 웹페이지와 다른 것은 다른 검사에서 하므로 여기서는 적지 않는다.
6. quote에는 clause 번호의 조항 안에 실제로 있는 문장을 한 글자도 바꾸지 않고 그대로 쓴다. 지어내지 않는다.
7. reason에는 H, M 번호를 쓰지 않고, 문서의 어떤 점이 조항과 어떻게 다른지만 쓴다.
8. 조항을 지킨 문장은 위반이 아니므로 절대 적지 않는다. reason에 "조항을 지켰다/충족한다"는 말을 쓰게 된다면 그 항목은 적지 않는다.
9. 위반이 없으면 violations를 빈 배열로 둔다.`;

function chunk(items: HItem[]): HItem[][] {
  const chunks: HItem[][] = [];
  let current: HItem[] = [];
  let size = 0;
  for (const item of items) {
    if (size + item.text.length > CHUNK_CHARS && current.length > 0) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.text.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

const words = (text: string) => new Set(text.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []);

// 매뉴얼이 길면 한글파일 조각과 겹치는 낱말이 많은 조항부터 한도까지 고른다 (원래 순서는 유지)
function pickClauses(all: { id: string; clause: ManualClause }[], chunkText: string) {
  const total = all.reduce((n, c) => n + c.clause.text.length, 0);
  if (total <= MANUAL_CHARS) return all;
  const doc = words(chunkText);
  const scored = all.map((c, i) => ({ c, i, score: [...words(c.clause.text)].filter((w) => doc.has(w)).length }));
  scored.sort((a, b) => b.score - a.score);
  const chosen: typeof scored = [];
  let size = 0;
  for (const s of scored) {
    if (size + s.c.clause.text.length > MANUAL_CHARS) continue;
    chosen.push(s);
    size += s.c.clause.text.length;
  }
  return chosen.sort((a, b) => a.i - b.i).map((s) => s.c);
}

// AI가 "지켰다"는 뜻으로 쓴 설명은 위반이 아니다 (어긋남을 뜻하는 말이 함께 없을 때만 버린다)
const KEPT = /충족한다|충족합니다|충족하고|준수|지켰|지키고 있|부합|문제가 없|맞게 (?:작성|적)/;
const BROKEN = /않|못|없|다르|다릅|빠|어긋|위반|아니/;
const saysKept = (reason: string) => KEPT.test(reason) && !BROKEN.test(reason.replace(/수습기간을 두는 경우|반드시/g, ""));

const squash = (text: string) => text.replace(/\s+/g, "");

async function askChunk(clauses: { id: string; clause: ManualClause }[], items: HItem[]) {
  const manualText = clauses.map(({ id, clause }) => `${id} [${clause.label}] ${clause.text}`).join("\n");
  const docText = items.map((h) => `${h.id}: ${h.inTable ? "(표 안) " : ""}${h.text}`).join("\n");
  const response = await getOpenAI().responses.parse({
    model: modelName(),
    ...reasoningOption(),
    instructions: INSTRUCTIONS,
    input: `[매뉴얼 조항]\n${manualText}\n\n[검사할 문서]\n${docText}`,
    text: { format: zodTextFormat(AnswerSchema, "manual_check") },
  });
  if (!response.output_parsed) throw new Error("AI 답이 정해진 모양이 아닙니다.");
  return response.output_parsed;
}

export async function checkManualRules(doc: HwpDocument, manual: ManualDoc): Promise<Finding[]> {
  const items: HItem[] = doc.paragraphs.map((p, i) => ({
    id: `H${i + 1}`,
    text: p.text.replace(/\n/g, " "),
    index: i,
    inTable: !!p.location.table,
  }));
  const byH = new Map(items.map((h) => [h.id, h]));
  const clauses = manual.clauses.map((clause, i) => ({ id: `M${i + 1}`, clause }));
  const byM = new Map(clauses.map((c) => [c.id, c.clause]));
  const chunks = chunk(items.filter((h) => h.text.trim()));
  if (chunks.length === 0 || clauses.length === 0) return [];

  // 모양이 틀린 답은 한 번 더 요청한다 (DESIGN.md §1)
  const answers = await Promise.all(
    chunks.map(async (c) => {
      const picked = pickClauses(clauses, c.map((h) => h.text).join(" "));
      try {
        return await askChunk(picked, c);
      } catch {
        return askChunk(picked, c);
      }
    }),
  );

  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const answer of answers) {
    for (const v of answer.violations) {
      const clause = byM.get(v.clause.trim());
      const quote = v.quote.trim();
      // 없는 조항이거나 조항에 없는 문장을 인용했으면 버린다 (지어내지 않기, PRD 5번)
      if (!clause || !quote || !squash(clause.text).includes(squash(quote))) continue;
      if (saysKept(v.reason)) continue;
      const h = v.h.trim() ? byH.get(v.h.trim()) : undefined;
      if (v.h.trim() && !h) continue;
      // 내용이 빠졌다는 지적은 문서 전체를 한 번에 본 경우에만 믿는다
      if (!h && chunks.length > 1) continue;
      const key = `${h?.id ?? "-"}|${clause.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        category: "규칙 위반",
        source: "본문",
        hwpLocation: h ? doc.paragraphs[h.index].location : undefined,
        hwpText: h?.text,
        manualClause: { item: clause.label, page: clause.page, quote },
        explanation: v.reason.replace(/[HM]\d+(?:은|는|이|가|의|에서)?\s*/g, "").trim() || "매뉴얼 조항과 맞지 않습니다.",
      });
    }
  }
  return findings;
}

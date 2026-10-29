import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAI, modelName, reasoningOption } from "@/lib/ai/client";
import type { HwpDocument } from "@/lib/readers/hwp-types";
import type { Finding } from "@/lib/types";

// Design Ref: DESIGN.md §3 3단계 맞춤법 — 한글파일 글자의 일반 맞춤법 오류와 고칠 표현을 받는다.
// PRD.md 5번 must 1: 맞춤법 오류는 "맞춤법" 카테고리에 따로, 매뉴얼 규칙 위반과 섞지 않고, 고칠 표현을 함께 제안한다.

type HItem = { id: string; text: string; index: number };

const CHUNK_CHARS = 6000;

const AnswerSchema = z.object({
  issues: z.array(
    z.object({
      h: z.string().describe("문장 번호 (예: H3)"),
      wrong: z.string().describe("문장 안에 실제로 있는 틀린 부분을 글자 그대로"),
      right: z.string().describe("바르게 고친 표현"),
      reason: z.string().describe("왜 틀렸는지 한국어 한 문장"),
    }),
  ),
});

const INSTRUCTIONS = `너는 한국어 맞춤법 검사기다. 공공기관 공시 문서의 문장(H…)에서 맞춤법·띄어쓰기·표준어 오류를 찾는다.
기준은 국립국어원의 한글 맞춤법, 띄어쓰기, 표준어 규정이다.

규칙:
1. 규정상 틀린 것이 확실할 때만 찾는다. 허용되는 표기, 문체, 더 좋은 표현을 권하는 것은 오류가 아니다.
2. 찾아야 하는 것:
   - 잘못 쓴 글자와 오타 (예: 검검→점검, 됬습니다→되었습니다, 드릴께요→드릴게요)
   - 표준어가 아닌 말 (예: 몇일→며칠, 금새→금세, 반듯이(꼭의 뜻)→반드시)
   - 의존 명사를 앞말에 붙여 쓴 것 (이상, 이하, 이내, 시(때), 등, 외, 간, 것, 수, 바, 데, 만큼, 뿐, 지) (예: 대졸이상→대졸 이상, 발생시→발생 시)
3. 찾지 말아야 하는 것 (허용되는 표기):
   - 낱말을 이어 쓴 명사 묶음과 전문 용어 (예: 실행관리, 해외고객사, 사출공정, 원가관련, 업무경력자). 한글 맞춤법 제50항에 따라 붙여 써도 된다.
   - 숫자와 단위를 붙여 쓴 것 (예: 5시30분, 3톤미만, 1차협력사, 4대보험). 제43항에 따라 붙여 써도 된다.
   - 접미사를 붙여 쓴 것 (예: 표준류, 지역별, 업무용, 직무상). 접미사는 원래 붙여 쓴다.
   - 영문·약어와 한글을 붙여 쓴 것 (예: KPI관리, PPT활용)
   - 쉼표·쌍점 같은 문장 부호 앞뒤의 띄어쓰기
4. 고유명사(기관명, 사람 이름, 지명, 상품명), 숫자, 날짜, 영문, 약어, 기호는 고치지 않는다.
5. wrong에는 그 문장 안에 실제로 있는 글자를 한 글자도 바꾸지 않고 그대로 쓴다. 문장에 없는 글자를 지어내지 않는다.
6. right에는 wrong 자리에 들어갈 바른 표현만 쓴다.
7. reason에는 H 번호를 쓰지 않는다.
8. 오류가 없으면 issues를 빈 배열로 둔다.`;

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

async function askChunk(items: HItem[]) {
  const response = await getOpenAI().responses.parse({
    model: modelName(),
    ...reasoningOption(),
    instructions: INSTRUCTIONS,
    input: items.map((h) => `${h.id}: ${h.text}`).join("\n"),
    text: { format: zodTextFormat(AnswerSchema, "spelling") },
  });
  if (!response.output_parsed) throw new Error("AI 답이 정해진 모양이 아닙니다.");
  return response.output_parsed;
}

export async function checkSpelling(doc: HwpDocument): Promise<Finding[]> {
  const items: HItem[] = doc.paragraphs.map((p, i) => ({ id: `H${i + 1}`, text: p.text.replace(/\n/g, " "), index: i }));
  const byId = new Map(items.map((h) => [h.id, h]));
  const chunks = chunk(items.filter((h) => /[가-힣]/.test(h.text)));
  if (chunks.length === 0) return [];

  // 모양이 틀린 답은 한 번 더 요청한다 (DESIGN.md §1)
  const answers = await Promise.all(
    chunks.map(async (c) => {
      try {
        return await askChunk(c);
      } catch {
        return askChunk(c);
      }
    }),
  );

  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const answer of answers) {
    for (const issue of answer.issues) {
      const h = byId.get(issue.h);
      const wrong = issue.wrong.trim();
      const right = issue.right.trim();
      // 문장에 실제로 없는 글자를 짚었거나, 고칠 것이 없는 답은 버린다 (지어내지 않기)
      if (!h || !wrong || !right || wrong === right || !h.text.includes(wrong)) continue;
      const key = `${h.id}|${wrong}|${right}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        category: "맞춤법",
        source: "본문",
        hwpLocation: doc.paragraphs[h.index].location,
        hwpText: h.text,
        diff: { hwp: wrong, web: right },
        suggestion: `${wrong} → ${right}`,
        explanation: issue.reason.replace(/H\d+(?:은|는|이|가|의|에서)?\s*/g, "").trim() || "맞춤법에 맞지 않습니다.",
      });
    }
  }
  return findings;
}

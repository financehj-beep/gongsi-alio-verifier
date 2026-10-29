// 공시 항목별 매뉴얼 조항 선택 시험 (가상 매뉴얼·가상 문서).
// 실행: set -a; . ./.env; set +a; npx tsx --conditions react-server scripts/manual-scope-test.mts
import { checkManualRules } from "../lib/ai/manual-check";
import type { ManualClause, ManualDoc } from "../lib/manual/types";

const c = (chapter: string, number: string, text: string): ManualClause => ({
  label: `${chapter.split(" ")[0]} ${number}항`, chapter, number, text,
});
const manual: ManualDoc = {
  fileName: "시험용 가상 매뉴얼", format: "hwpx", structured: true, pageKnown: false, charCount: 1000,
  clauses: [
    c("제1장 총칙", "1.1", "이 매뉴얼은 공사가 알리오에 공시하는 모든 항목의 작성 방법을 정한다."),
    c("제2장 공통 작성 규칙", "2.1", "날짜는 2026.11.03 형식(연.월.일)으로 적는다. 하이픈(-)이나 슬래시(/)를 쓰지 않는다."),
    c("제2장 공통 작성 규칙", "2.2", "금액은 천 단위마다 쉼표를 찍고 단위는 원으로 적는다."),
    c("제3장 채용공시", "3.1", "채용공시에는 모집 분야, 모집 인원, 접수 기간, 접수 방법을 반드시 적는다."),
    c("제3장 채용공시", "3.2", "수습기간을 두는 경우 수습기간은 3개월로 적는다."),
    c("제4장 입찰공시", "4.1", "입찰공시에는 입찰 보증금, 개찰 일시, 낙찰자 결정 방법을 반드시 적는다."),
    c("제4장 입찰공시", "4.2", "입찰 보증금은 입찰금액의 5퍼센트 이상으로 적는다."),
    c("제5장 문의와 정정", "5.1", "문의처는 부서명과 전화번호를 함께 적는다."),
  ],
};
const mk = (lines: string[]) => ({ paragraphs: lines.map((text, i) => ({ text, location: { paragraph: i + 1 } })) }) as unknown as Parameters<typeof checkManualRules>[0];

// [문서, 기대: 걸려야 하는 장, 걸리면 안 되는 장]
const docs: { name: string; doc: ReturnType<typeof mk>; want: string[]; forbid: string[] }[] = [
  {
    name: "채용 (날짜 형식 위반 + 수습기간 위반)",
    doc: mk(["한국시험공사 2026년도 신입사원 채용 공고", "모집 분야: 사무직, 모집 인원: 5명", "접수 기간: 2026-11-03 ~ 2026-11-20", "접수 방법: 온라인 접수", "수습기간은 6개월로 합니다.", "문의: 인사팀 02-123-4567"]),
    want: ["제2장 공통 작성 규칙", "제3장 채용공시"],
    forbid: ["제4장 입찰공시"],
  },
  {
    name: "채용 (위반 없음)",
    doc: mk(["한국시험공사 2026년도 신입사원 채용 공고", "모집 분야: 사무직, 모집 인원: 5명", "접수 기간: 2026.11.03 ~ 2026.11.20", "접수 방법: 온라인 접수", "수습기간은 3개월로 합니다.", "문의: 인사팀 02-123-4567"]),
    want: [],
    forbid: ["제3장 채용공시", "제4장 입찰공시", "제2장 공통 작성 규칙"],
  },
  {
    name: "입찰 (보증금 비율 위반 + 날짜 형식 위반)",
    doc: mk(["대한물류공단 2026년도 청사 청소용역 입찰 공고", "입찰 보증금: 입찰금액의 3퍼센트", "개찰 일시: 2026/12/05 10시", "낙찰자 결정 방법: 최저가 낙찰", "문의: 계약팀 02-555-0000"]),
    want: ["제4장 입찰공시", "제2장 공통 작성 규칙"],
    forbid: ["제3장 채용공시"],
  },
];

let ok = 0, total = 0;
for (const d of docs) {
  const found = await checkManualRules(d.doc, manual);
  const chapters = found.map((f) => f.manualClause?.chapter ?? "(장 없음)");
  const wantOk = d.want.every((w) => chapters.includes(w));
  const forbidHit = d.forbid.filter((x) => chapters.includes(x));
  total++;
  if (wantOk && forbidHit.length === 0) ok++;
  console.log(`${wantOk && forbidHit.length === 0 ? "통과" : "실패"} · ${d.name} → 걸린 장: ${[...new Set(chapters)].join(", ") || "(없음)"}${forbidHit.length ? ` / 걸리면 안 되는 장이 걸림: ${forbidHit.join(", ")}` : ""}${wantOk ? "" : " / 놓친 장 있음"}`);
}
console.log(`${ok}/${total} 통과`);

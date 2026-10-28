import { notFound } from "next/navigation";
import ResultsView from "@/components/ResultsView";
import type { Finding } from "@/lib/types";

// 결과 화면을 미리 확인하기 위한 예시 화면 (개발 중에만 열린다).
// 내용 비교(PLAN.md 11번)가 완성되면 trash-can으로 옮긴다.

const mismatches: Finding[] = Array.from({ length: 25 }, (_, i) => ({
  category: "불일치",
  source: "본문",
  hwpLocation: { page: 2, paragraph: i + 1 },
  webLocation: { heading: "모집인원", sentence: i + 1 },
  hwpText: `모집인원 ${1500 + i * 10}명 (정규직)`,
  webText: `모집인원 ${1050 + i * 10}명 (정규직)`,
  diff: { hwp: `${1500 + i * 10}`, web: `${1050 + i * 10}` },
  explanation: "모집인원 숫자가 다릅니다.",
}));

const samples: Finding[] = [
  ...mismatches,
  {
    category: "불일치",
    source: "본문",
    hwpLocation: { paragraph: 7, table: { index: 1, row: 3, col: 2 } },
    webLocation: { heading: "접수기간", sentence: 1 },
    hwpText: "2026.11.03(화) 18:00까지",
    webText: "2026-11-03(화) 18:00까지",
    diff: { hwp: "2026.11.03", web: "2026-11-03" },
    explanation: "날짜 표기가 다릅니다. 값이 같아도 표기가 다르면 불일치로 봅니다.",
  },
  {
    category: "누락",
    source: "본문",
    hwpLocation: { page: 3, paragraph: 2 },
    missingSide: "웹페이지",
    hwpText: "※ 최종합격자는 3개월간 수습기간을 둡니다.",
    webText: "",
    explanation: "한글파일에는 있는데 웹페이지에는 없는 문장입니다.",
  },
  {
    category: "누락",
    source: "본문",
    webLocation: { heading: "우대사항", sentence: 4 },
    missingSide: "한글파일",
    hwpText: "",
    webText: "정보처리기사 자격증 소지자 우대",
    explanation: "웹페이지에는 있는데 한글파일에는 없는 문장입니다.",
  },
  {
    category: "확인 필요",
    source: "이미지",
    imageLocation: { side: "웹페이지", index: 2, area: "아래" },
    hwpLocation: { page: 1, paragraph: 5 },
    hwpText: "문의: 02-1234-5678",
    webText: "문의: 02-1234-567?",
    explanation: "이미지 글자가 흐려 마지막 숫자를 또렷하게 읽지 못했습니다.",
  },
  {
    category: "확인 필요",
    source: "본문",
    hwpLocation: { page: 2, paragraph: 9 },
    webLocation: { heading: "자격요건", sentence: 2 },
    hwpText: "학력 및 전공 제한 없음, 남성은 병역필 또는 면제자",
    webText: "남성은 병역필 또는 면제자이며 학력·전공 제한은 없음",
    explanation: "문장 순서가 바뀌어 같은 내용인지 확인이 필요합니다.",
  },
  {
    category: "맞춤법",
    source: "본문",
    hwpLocation: { page: 1, paragraph: 3 },
    hwpText: "서류가 접수되면 개별 연락 드릴께요.",
    suggestion: "드릴께요 → 드릴게요",
    explanation: "'-ㄹ게요'가 맞는 표기입니다.",
  },
  {
    category: "맞춤법",
    source: "본문",
    hwpLocation: { paragraph: 12 },
    hwpText: "지원서는 반듯이 기한 내에 제출해야 합니다.",
    suggestion: "반듯이 → 반드시",
    explanation: "'꼭'이라는 뜻일 때는 '반드시'로 씁니다.",
  },
  {
    category: "규칙 위반",
    source: "본문",
    hwpLocation: { page: 1, paragraph: 1 },
    hwpText: "2026년도 하반기 신입사원 채용 공고",
    manualClause: { item: "제3장 2.1항", page: 15 },
    explanation: "공고 제목에 기관명을 앞에 붙여야 합니다.",
  },
  {
    category: "규칙 위반",
    source: "본문",
    hwpLocation: { paragraph: 20 },
    hwpText: "접수방법: 이메일 접수",
    manualClause: { item: "제4장 1.3항" },
    explanation: "접수방법에는 담당 부서와 연락처를 함께 적어야 합니다.",
  },
];

export default function DemoResultsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-8">
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        예시 결과 화면입니다. 실제 검증 결과가 아니라 화면 확인용으로 만든 가짜 데이터입니다.
      </p>
      <ResultsView findings={samples} />
    </main>
  );
}

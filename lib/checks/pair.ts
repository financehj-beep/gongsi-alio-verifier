import type { HwpDocument } from "@/lib/readers/hwp-types";
import type { WebPage } from "@/lib/readers/web";

// Design Ref: DESIGN.md §3 1단계 읽기 5번 — 본격적인 비교 전에 공고 제목·기관명을 먼저 대조해
// 서로 다른 공고로 보이면 담당자에게 계속할지 묻는다 (PRD.md 4번 예외 상황 3).
// AI를 쓰지 않고 코드로만 판단한다. 빠르고 요금이 들지 않는다.

export type PairCheck = {
  likelySame: boolean;
  // 화면에 보여줄 근거
  hwpTitle: string;
  webTitle: string;
  organization?: string;
  organizationFound?: boolean;
  // 한글파일 낱말 중 웹페이지에도 있는 낱말의 비율 (0~1)
  overlap: number;
  // 웹페이지에 공고 본문이 한글파일에 비해 거의 없는 경우(소개·목록 페이지 주소를 넣은 경우 등)
  thin: boolean;
  hwpChars: number;
  webChars: number;
};

// 웹 글자 수가 한글파일의 이 비율보다 적으면 본문이 없는 페이지로 본다 (한글파일이 이 글자 수 이상일 때만 판단)
const THIN_RATIO = 0.15;
const THIN_MIN_HWP_CHARS = 500;

const imageChars = (texts?: { lines: { text: string }[] }[]) =>
  (texts ?? []).reduce((n, t) => n + t.lines.reduce((m, l) => m + l.text.replace(/\s+/g, "").length, 0), 0);

// 공고마다 흔히 나오는 낱말은 같은 공고인지 판단하는 데 도움이 되지 않아 뺀다
const COMMON = new Set([
  "채용", "공고", "모집", "지원", "접수", "서류", "전형", "면접", "합격", "합격자", "기간", "방법", "자격", "요건",
  "우대", "사항", "근무", "근무지", "근무형태", "급여", "정규직", "계약직", "신입", "경력", "문의", "기타", "안내",
  "제출", "홈페이지", "이메일", "있음", "없음", "가능", "바랍니다", "합니다", "입니다", "있습니다", "사람인",
]);

// 낱말로 자른다. 두 글자 이상만 쓰고, 조사 몇 가지는 떼어 낸다.
export function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    const w = raw.replace(/(은|는|이|가|을|를|의|에|에서|으로|로|과|와|및)$/u, "");
    if (w.length >= 2 && !COMMON.has(w)) out.add(w);
  }
  return out;
}

// 기관명은 "(주)", "주식회사", 띄어쓰기를 빼고 비교한다
function normalizeOrg(text: string): string {
  return text.replace(/\(주\)|㈜|주식회사|\(재\)|재단법인|\(사\)|사단법인|\s+/g, "").toLowerCase();
}

// 웹페이지 제목에서 기관명을 찾는다. 사람인 제목은 "[(주)기관명] 공고 제목 - 사람인" 모양이다.
function organizationOf(webTitle: string): string | undefined {
  const bracket = /^\s*\[([^\]]{2,40})\]/.exec(webTitle)?.[1];
  return bracket?.trim() || undefined;
}

export function checkPair(hwp: HwpDocument, web: WebPage): PairCheck {
  const hwpText = hwp.paragraphs.map((p) => p.text).join("\n");
  const webText = [web.title, ...web.blocks.flatMap((b) => [b.heading, ...b.sentences])].join("\n");

  const hwpWords = words(hwpText);
  const webWords = words(webText);
  let shared = 0;
  for (const w of hwpWords) if (webWords.has(w)) shared += 1;
  const overlap = hwpWords.size === 0 ? 0 : shared / hwpWords.size;

  // 본문 글자 수(그림 속 글자 포함)를 견줘, 웹페이지에 비교할 내용이 거의 없는지 본다
  const hwpChars = hwpText.replace(/\s+/g, "").length + imageChars(hwp.imageTexts);
  const webChars = webText.replace(/\s+/g, "").length + imageChars(web.imageTexts);
  const thin = hwpChars >= THIN_MIN_HWP_CHARS && webChars < hwpChars * THIN_RATIO;

  const organization = organizationOf(web.title);
  const organizationFound = organization ? normalizeOrg(hwpText).includes(normalizeOrg(organization)) : undefined;

  // 같은 공고로 보는 경우: 기관명이 한글파일에 있거나, 낱말이 충분히 겹칠 때
  // (본문이 그림뿐인 공고는 글자를 비교할 수 없으므로 기관명만으로 판단한다)
  const webHasText = web.charCount >= 20;
  const likelySame = !thin && (organizationFound === true || (webHasText && overlap >= 0.35) || (!webHasText && organizationFound !== false));

  return {
    likelySame,
    hwpTitle: hwp.paragraphs[0]?.text.split("\n")[0].slice(0, 80) ?? "",
    webTitle: web.title,
    organization,
    organizationFound,
    overlap: Math.round(overlap * 100) / 100,
    thin,
    hwpChars,
    webChars,
  };
}

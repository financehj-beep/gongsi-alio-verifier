// 성공 기준 측정(PLAN.md 22번, PRD.md 3번 "측정 방법")
// 가상 공고 10건에 오류를 일부러 심고, 앱의 비교·맞춤법·매뉴얼 검사가 얼마나 찾는지 잰다.
// 실행: set -a; . ./.env; set +a; npx tsx --conditions react-server scripts/measure.mts
// 웹페이지는 따로 읽지 않고 같은 글자를 직접 넣는다(웹 읽기 정확도는 이 측정 대상이 아니다).
import { writeFile } from "node:fs/promises";
import { checkManualRules } from "@/lib/ai/manual-check";
import { compareTexts } from "@/lib/ai/compare";
import { checkSpelling } from "@/lib/ai/spelling";
import { loadDefaultManual } from "@/lib/manual/load";
import type { HwpDocument } from "@/lib/readers/hwp-types";
import type { WebPage } from "@/lib/readers/web";
import type { Finding } from "@/lib/types";

// 같은 결과가 나오도록 고정된 난수
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Kind = "숫자·날짜" | "문구" | "누락" | "맞춤법" | "규칙 위반";
const EXPECT: Record<Kind, Finding["category"]> = { "숫자·날짜": "불일치", 문구: "불일치", 누락: "누락", 맞춤법: "맞춤법", "규칙 위반": "규칙 위반" };

type Slot = { heading: string; hwp: string | null; web: string | null; table?: boolean };
type Plant = { kind: Kind; key: string };

const ORGS = ["한국시험공사", "대한물류공단", "국민안전진흥원", "한빛에너지공사", "미래교통공단", "푸른환경공사", "새롬문화재단", "동해항만공사", "바른금융원", "누리정보진흥원"];
const JOBS = ["신입사원", "경력직원", "체험형 인턴", "전문위원"];
const GUS = ["종로구", "마포구", "강남구", "영등포구", "송파구"];
const FIELDS = [["사무직", "행정직"], ["기술직", "전산직"], ["연구직", "시설직"]];

// 오류를 심는 방식별 후보. 각 후보는 [깨끗한 문장, 심은 문장] (한글파일 쪽만 바뀌는 것은 hwp에 심은 문장)
function build(caseNo: number) {
  const r = rng(caseNo * 7919 + 13);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const n = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const org = ORGS[caseNo - 1];
  const abbr = org.slice(2);
  const job = pick(JOBS);
  const gu = pick(GUS);
  const [f1, f2] = pick(FIELDS);
  const n1 = n(10, 90);
  const n2 = n(5, 60);
  const years = n(2, 7);
  const toeic = n(6, 9) * 100;
  const salary = n(30, 45);
  const D = (m: number, d: number) => `2026.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
  const day = ["월", "화", "수", "목", "금", "토", "일"];
  const when = (m: number, d: number) => `${D(m, d)}(${day[(m * 31 + d) % 7]})`;

  const slots: Slot[] = [];
  const S = (heading: string, text: string, table = false) => slots.push({ heading, hwp: text, web: text, table });
  const title = `${org} 2026년도 하반기 ${job} 채용 공고`;
  S("", title);
  S("", `${org}에서 다음과 같이 ${job}을 채용하오니 많은 지원 바랍니다.`);
  S("1. 모집 분야 및 인원", f1, true);
  S("1. 모집 분야 및 인원", `${n1}명`, true);
  S("1. 모집 분야 및 인원", f2, true);
  S("1. 모집 분야 및 인원", `${n2}명`, true);
  S("2. 자격 요건", "학력: 학사 학위 이상 소지자");
  S("2. 자격 요건", `경력: 관련 분야 ${years}년 이상 근무 경력자`);
  S("2. 자격 요건", `어학: TOEIC ${toeic}점 이상`);
  S("2. 자격 요건", `결격 사유가 없고 ${job} 임용에 해당하는 법령상 제한이 없는 사람`);
  S("3. 근무 조건", `근무 지역: 서울특별시 ${gu}`);
  S("3. 근무 조건", "근무 시간: 09시 00분 ~ 18시 00분");
  S("3. 근무 조건", "채용 형태: 정규직 (수습 3개월)");
  S("3. 근무 조건", `급여: 연봉 ${salary},000,000원`);
  S("3. 근무 조건", "복리후생: 4대 보험 가입, 중식 제공");
  S("4. 전형 일정", `접수 기간: ${when(11, 3)} 09:00 ~ ${when(11, 20)} 18:00`);
  S("4. 전형 일정", `서류전형 합격자 발표: ${when(11, 25)}`);
  S("4. 전형 일정", `면접전형: ${when(12, 5)}`);
  S("4. 전형 일정", `최종합격자 발표: ${when(12, 15)}`);
  S("5. 접수 방법", "접수 방법: 이메일 접수 (인사팀 02-1234-5678)");
  S("5. 접수 방법", "문의: 인사팀 02-1234-5678");
  S("5. 접수 방법", `${org} 인재개발원에서 입사 후 교육을 받습니다.`);
  S("6. 유의 사항", "서류전형 불합격자에게는 개별 통보하지 않습니다.");
  S("6. 유의 사항", "지원 서류는 며칠 이내에 개별 연락드리겠습니다.");
  S("6. 유의 사항", "제출 서류는 반드시 원본을 지참하시기 바랍니다.");
  S("6. 유의 사항", "공고 내용이 일부 변경되었습니다.");
  S("6. 유의 사항", "접수 마감일이 금세 다가오니 서둘러 접수하시기 바랍니다.");
  S("6. 유의 사항", "자격 요건은 대졸 이상입니다.");
  S("6. 유의 사항", "면접 일정은 추후 문자로 안내드리겠습니다.");
  S("6. 유의 사항", "입사 후 어떻게 근무하게 되는지 면접에서 안내합니다.");
  S("6. 유의 사항", "허위 사실이 확인되면 합격이 취소될 수 있습니다.");
  S("6. 유의 사항", "채용과 관련한 문의는 인사팀으로 해 주시기 바랍니다.");

  const find = (frag: string) => {
    const s = slots.find((x) => x.hwp?.includes(frag));
    if (!s) throw new Error("슬롯 없음: " + frag);
    return s;
  };
  const plants: Plant[] = [];
  // 한글파일 쪽 문장을 바꾸고 정답을 기록한다 (웹페이지는 원래 문장 그대로)
  const swapHwp = (frag: string, to: (t: string) => string, kind: Kind) => {
    const s = find(frag);
    s.hwp = to(s.hwp!);
    plants.push({ kind, key: s.hwp! });
  };
  // 양쪽 문장을 같이 바꾼다 (맞춤법·규칙 위반: 웹페이지에 옮겨 적은 경우)
  const swapBoth = (frag: string, to: (t: string) => string, kind: Kind) => {
    const s = find(frag);
    s.hwp = to(s.hwp!);
    s.web = s.hwp;
    plants.push({ kind, key: s.hwp! });
  };
  const dropHwp = (frag: string) => {
    const s = find(frag);
    plants.push({ kind: "누락", key: s.web! });
    s.hwp = null;
  };
  const dropWeb = (frag: string) => {
    const s = find(frag);
    plants.push({ kind: "누락", key: s.hwp! });
    s.web = null;
  };

  // 숫자·날짜 4개 (한글파일만 다르게)
  const numberPlants: [string, (t: string) => string][] = [
    [`관련 분야 ${years}년`, (t) => t.replace(`${years}년`, `${years + 2}년`)],
    [`TOEIC`, (t) => t.replace(`${toeic}점`, `${toeic - 50}점`)],
    [`연봉`, (t) => t.replace(`${salary},000,000원`, `${salary},500,000원`)],
    [`${n1}명`, (t) => t.replace(`${n1}명`, `${n1 + 5}명`)],
    ["면접전형", (t) => t.replace(/\.(\d\d)\(/, (_, d) => `.${String(Number(d) + 1).padStart(2, "0")}(`)],
    ["근무 시간", (t) => t.replace("09시", "9시")],
    ["서류전형 합격자 발표", (t) => t.replace(/2026\.11\.25/, "2026.11.26")],
    ["문의: 인사팀", (t) => t.replace("1234-5678", "1234-5679")],
  ];
  const chosenNum = numberPlants.sort(() => r() - 0.5).slice(0, 4);
  for (const [frag, fn] of chosenNum) swapHwp(frag, fn, "숫자·날짜");
  const touched = new Set(chosenNum.map((c) => c[0]));

  // 문구 3개
  const wordPlants: [string, (t: string) => string][] = [
    ["채용 형태", (t) => t.replace("정규직", "계약직")],
    ["근무 지역", (t) => t.replace(gu, GUS.find((g) => g !== gu)!)],
    ["학력", (t) => t.replace("학사", "석사")],
    ["접수 방법: 이메일", (t) => t.replace("이메일 접수", "방문 접수")],
    ["복리후생", (t) => t.replace("중식 제공", "석식 제공")],
    [f1, (t) => t.replace(f1, f1 === "사무직" ? "기술직" : "사무직")],
  ];
  for (const [frag, fn] of wordPlants.filter((w) => !touched.has(w[0])).sort(() => r() - 0.5).slice(0, 3)) swapHwp(frag, fn, "문구");

  // 누락 3개: 한글파일에서 2개, 웹페이지에서 1개 지운다
  const omit = ["결격 사유", "채용과 관련한 문의", "최종합격자 발표", "허위 사실"].sort(() => r() - 0.5);
  dropHwp(omit[0]);
  dropHwp(omit[1]);
  dropWeb(omit[2]);

  // 맞춤법 3개 (양쪽 모두 같은 오타)
  const typos: [string, (t: string) => string][] = [
    ["며칠", (t) => t.replace("며칠", "몇일")],
    ["반드시", (t) => t.replace("반드시", "반듯이")],
    ["변경되었습니다", (t) => t.replace("변경되었습니다", "변경됬습니다")],
    ["금세", (t) => t.replace("금세", "금새")],
    ["대졸 이상입니다", (t) => t.replace("대졸 이상입니다", "대졸이상입니다")],
    ["통보하지 않습니다", (t) => t.replace("않습니다", "않읍니다")],
    ["안내드리겠습니다", (t) => t.replace("안내드리겠습니다", "안내드릴께요")],
    ["어떻게", (t) => t.replace("어떻게", "어떻해")],
  ];
  for (const [frag, fn] of typos.sort(() => r() - 0.5).slice(0, 3)) swapBoth(frag, fn, "맞춤법");

  // 규칙 위반 2개 (양쪽 모두 같은 문장). 매뉴얼 제2장·제3장·제4장 규칙
  const rules: [string, (t: string) => string][] = [
    ["서류전형 합격자 발표", (t) => t.replace(/2026\.11\.25\(.\)/, "2026-11-25")],
    ["급여", (t) => t.replace(`${salary},000,000원`, `${salary}000000원`)],
    ["문의: 인사팀", (t) => `문의: 인사팀 담당자 010-2345-6789`],
    ["인재개발원", (t) => t.replace(org, abbr)],
    ["접수 기간", (t) => t.replace(/ 09:00/, "").replace(/ 18:00/, "")],
  ];
  const usedFrag = new Set(plants.map((p) => p.key));
  const rulePool = rules.filter(([frag]) => {
    const s = slots.find((x) => x.hwp?.includes(frag) || x.web?.includes(frag));
    return s && s.hwp === s.web && !usedFrag.has(s.hwp ?? "");
  });
  for (const [frag, fn] of rulePool.sort(() => r() - 0.5).slice(0, 2)) swapBoth(frag, fn, "규칙 위반");

  // 한글파일·웹페이지 글자로 만든다
  const hwpSlots = slots.filter((s) => s.hwp !== null);
  let tableIdx = 0;
  let col = 0;
  // 실제 한글파일처럼 소제목(1. 모집 분야 및 인원 …)도 한 문단으로 들어 있다
  const hwpParas: { text: string; table: boolean }[] = [];
  let lastHeading = "";
  for (const s of hwpSlots) {
    if (s.heading && s.heading !== lastHeading) hwpParas.push({ text: s.heading, table: false });
    lastHeading = s.heading;
    hwpParas.push({ text: s.hwp!, table: !!s.table });
  }
  const hwp: HwpDocument = {
    format: "hwpx",
    paragraphs: hwpParas.map((s, i) => {
      const location: HwpDocument["paragraphs"][number]["location"] = { page: 1, paragraph: i + 1 };
      if (s.table) {
        tableIdx = 1;
        location.table = { index: tableIdx, row: Math.floor(col / 2) + 1, col: (col % 2) + 1 };
        col += 1;
      }
      return { text: s.text, location };
    }),
    images: [],
    pageKnown: true,
    pageCount: 1,
    charCount: hwpParas.reduce((c, s) => c + s.text.length, 0),
  };
  const blocks: WebPage["blocks"] = [];
  for (const s of slots) {
    if (s.web === null) continue;
    let b = blocks[blocks.length - 1];
    if (!b || b.heading !== s.heading) {
      b = { heading: s.heading, sentences: [] };
      blocks.push(b);
    }
    b.sentences.push(s.web);
  }
  const web: WebPage = { url: "https://example.test/job", title: title, blocks, images: [], charCount: blocks.reduce((c, b) => c + b.sentences.join("").length, 0) };
  return { org, hwp, web, plants };
}

type Score = { total: number; hit: number };
async function main() {
  const manual = await loadDefaultManual();
  if (!manual.ok) throw new Error("매뉴얼을 읽지 못했습니다");
  const perKind: Record<Kind, Score> = { "숫자·날짜": { total: 0, hit: 0 }, 문구: { total: 0, hit: 0 }, 누락: { total: 0, hit: 0 }, 맞춤법: { total: 0, hit: 0 }, "규칙 위반": { total: 0, hit: 0 } };
  const rows: string[] = [];
  const details: string[] = [];
  let totalFp = 0;
  let totalPlants = 0;
  const times: number[] = [];

  for (let c = 1; c <= 10; c++) {
    const { org, hwp, web, plants } = build(c);
    const t0 = Date.now();
    // 앱과 같은 순서로 세 단계를 차례로 돌린다
    const cmp = await compareTexts(hwp, web);
    const t1 = Date.now();
    const spell = await checkSpelling(hwp);
    const t2 = Date.now();
    const rule = await checkManualRules(hwp, manual.manual);
    const t3 = Date.now();
    const findings = [...cmp, ...spell, ...rule];
    times.push(t3 - t0);

    const text = (f: Finding) => `${f.hwpText ?? ""}\n${f.webText ?? ""}`.replace(/\s+/g, "");
    const claimed = new Set<number>();
    let hits = 0;
    for (const p of plants) {
      perKind[p.kind].total += 1;
      const key = p.key.replace(/\s+/g, "");
      const idx = findings.findIndex((f, i) => text(f).includes(key) && f.category === EXPECT[p.kind] && !claimed.has(i));
      const loose = idx >= 0 ? -1 : findings.findIndex((f, i) => text(f).includes(key) && f.category === "확인 필요" && !claimed.has(i));
      if (idx >= 0) {
        claimed.add(idx);
        perKind[p.kind].hit += 1;
        hits += 1;
      } else if (loose >= 0) {
        claimed.add(loose);
        perKind[p.kind].hit += 0.5;
        hits += 0.5;
        details.push(`[${c}] 확인 필요로 나옴(0.5): ${p.kind} — ${p.key}`);
      } else {
        details.push(`[${c}] 못 찾음: ${p.kind} — ${p.key}`);
      }
    }
    // 심은 문장과 글자가 겹치는 다른 결과(같은 오류를 두 번 말한 것 등)는 오탐으로 세지 않는다
    const plantKeys = plants.map((p) => p.key.replace(/\s+/g, ""));
    const fp = findings.filter((f, i) => !claimed.has(i) && !plantKeys.some((k) => text(f).includes(k)));
    fp.forEach((f) => details.push(`[${c}] 오탐: ${f.category} — ${f.hwpText || f.webText} ⇒ ${f.explanation}`));
    totalFp += fp.length;
    totalPlants += plants.length;
    rows.push(`| ${c} | ${org} | ${plants.length} | ${hits} | ${fp.length} | ${((t1 - t0) / 1000).toFixed(1)} / ${((t2 - t1) / 1000).toFixed(1)} / ${((t3 - t2) / 1000).toFixed(1)} | ${((t3 - t0) / 1000).toFixed(1)} |`);
    console.log(rows[rows.length - 1]);
  }

  const pct = (s: Score) => (s.total ? ((s.hit / s.total) * 100).toFixed(1) : "-") + "%";
  const out = [
    `| 사례 | 기관 | 심은 오류 | 찾은 수 | 오탐 | 비교/맞춤법/매뉴얼 초 | 합계 초 |`,
    `|---|---|---|---|---|---|---|`,
    ...rows,
    "",
    `| 유형 | 심은 수 | 찾은 수 | 검출률 |`,
    `|---|---|---|---|`,
    ...(Object.keys(perKind) as Kind[]).map((k) => `| ${k} | ${perKind[k].total} | ${perKind[k].hit} | ${pct(perKind[k])} |`),
    "",
    `심은 오류 ${totalPlants}개, 오탐 ${totalFp}건 (1건당 ${(totalFp / 10).toFixed(1)}건), 검사 시간 최대 ${(Math.max(...times) / 1000).toFixed(1)}초 / 평균 ${(times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1)}초`,
    "",
    ...details,
  ].join("\n");
  console.log("\n" + out);
  await writeFile("scripts/measure-result.tmp.md", out);
}
main();

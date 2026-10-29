// 실습용 샘플 공시 매뉴얼을 만든다 (PDF와 .hwpx 두 가지). 실제 매뉴얼은 비공개라 코드에 넣지 않는다.
// 내용은 이 앱을 시험하려고 지어낸 가상의 규칙이다. PDF는 macOS의 Core Text로 만든다.
// 실행: node scripts/make-sample-manual.mjs
import JSZip from "jszip";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const TITLE = "한국시험공사 경영공시 작성 매뉴얼 (실습용 샘플)";

// 쪽 단위로 적는다. 장은 "제N장", 항은 "N.M"으로 번호를 붙인다.
const pages = [
  [
    TITLE,
    "",
    "제1장 총칙",
    "1.1 목적 이 매뉴얼은 알리오에 공시하는 내용의 작성 기준을 정한다.",
    "1.2 적용 범위 모든 부점은 공시 내용을 이 매뉴얼에 따라 작성한다.",
    "1.3 용어 공시 담당자란 부점이 보낸 공시 내용을 검증하고 알리오에 입력하는 사람을 말한다.",
    "",
    "제2장 공통 작성 규칙",
    "2.1 날짜는 2026.11.03 형식(연.월.일)으로 쓰고 요일은 괄호로 덧붙인다.",
    "2.2 금액과 인원은 천 단위마다 쉼표를 찍고 단위를 붙인다. 예: 1,500명, 3,200,000원",
    "2.3 기관명은 약칭을 쓰지 않고 정식 명칭으로 쓴다.",
  ],
  [
    "제3장 채용공시",
    "3.1 공고 제목은 기관명으로 시작한다. 예: 한국시험공사 2026년도 하반기 신입사원 채용 공고",
    "3.2 모집 분야와 인원은 표로 정리한다.",
    "3.3 접수 기간에는 시작일과 마감일, 마감 시각을 모두 적는다.",
    "3.4 최종합격자에게 수습기간을 두는 경우 반드시 공고문에 그 기간을 적는다.",
  ],
  [
    "제4장 문의와 정정",
    "4.1 접수 방법에는 담당 부서와 연락처를 함께 적는다.",
    "4.2 개인 휴대전화 번호는 공고에 적지 않는다.",
    "4.3 오탈자가 확인되면 정정공시를 즉시 한다.",
  ],
];

await mkdir("data/sample-manual", { recursive: true });

// 1) PDF: 쪽 나눔(\f)이 있는 글자 파일을 PDF로 바꾼다 (글자 정보가 들어가는 scripts/pdf-from-text.swift 사용)
const text = pages.map((p) => p.join("\n")).join("\n\f");
await writeFile("data/sample-manual/.source.txt", text);
execFileSync("swift", ["scripts/pdf-from-text.swift", "data/sample-manual/.source.txt", "data/sample-manual/sample-manual.pdf"], { stdio: "inherit" });
const pdf = await readFile("data/sample-manual/sample-manual.pdf");

// 2) .hwpx: 같은 내용을 공개된 형식 규칙대로 담는다 (쪽 나눔 표시 사용)
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
let section = "";
let vert = 0;
pages.forEach((lines, pi) => {
  lines.forEach((line, li) => {
    if (!line) return;
    section +=
      `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="${pi > 0 && li === 0 ? 1 : 0}" columnBreak="0" merged="0">` +
      `<hp:run charPrIDRef="0"><hp:t>${esc(line)}</hp:t></hp:run>` +
      `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${(vert = li === 0 ? 0 : vert + 1600)}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>` +
      `</hp:p>`;
  });
});
const sec = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">${section}</hs:sec>`;
const zip = new JSZip();
zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
zip.file("version.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" major="5" minor="1" micro="0" buildNumber="0"/>`);
zip.file(
  "Contents/content.hpf",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf/"><opf:manifest><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/></opf:manifest></opf:package>`,
);
zip.file("Contents/section0.xml", sec);
await writeFile("data/sample-manual/sample-manual.hwpx", await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

// 3) 시험용 손상 파일과 글자 없는 PDF
await writeFile("data/sample-manual/broken-sample.pdf", pdf.subarray(0, 300));
await writeFile("data/sample-manual/.blank.txt", "\n\n");
execFileSync("swift", ["scripts/pdf-from-text.swift", "data/sample-manual/.blank.txt", "data/sample-manual/blank-sample.pdf"], { stdio: "inherit" });
console.log("만든 파일: data/sample-manual/ 안의 sample-manual.pdf, sample-manual.hwpx, broken-sample.pdf, blank-sample.pdf");

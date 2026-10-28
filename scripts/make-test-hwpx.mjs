// 시험용 .hwpx 파일을 공개된 형식 규칙(OWPML, KS X 6101)대로 만든다.
// 한글 프로그램이 실제로 저장한 파일과 세부 모양이 다를 수 있으니, 진짜 파일로도 한 번 더 확인해야 한다.
// 실행: node scripts/make-test-hwpx.mjs
import JSZip from "jszip";
import { mkdir, writeFile } from "node:fs/promises";

const NS =
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" ' +
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" ' +
  'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"';

// 문단 하나. vertpos는 쪽 안에서의 세로 위치(쪽이 바뀌면 다시 작아진다)
function p(text, { vertpos = 0, pageBreak = false } = {}) {
  return (
    `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="${pageBreak ? 1 : 0}" columnBreak="0" merged="0">` +
    `<hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run>` +
    `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${vertpos}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>` +
    `</hp:p>`
  );
}

function cell(row, col, text) {
  return (
    `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="1">` +
    `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER">${p(text)}</hp:subList>` +
    `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/>` +
    `</hp:tc>`
  );
}

function table(rows, vertpos) {
  const trs = rows.map((cols, r) => `<hp:tr>${cols.map((c, ci) => cell(r, ci, c)).join("")}</hp:tr>`).join("");
  return (
    `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">` +
    `<hp:tbl id="1" rowCnt="${rows.length}" colCnt="${rows[0].length}" cellSpacing="0" borderFillIDRef="1">${trs}</hp:tbl>` +
    `</hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="${vertpos}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>`
  );
}

const picture =
  `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">` +
  `<hp:pic id="2" zOrder="0" numberingType="PICTURE"><hc:img binaryItemIDRef="image1" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/></hp:pic>` +
  `</hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="9000" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>`;

// 쪽 1: 제목과 안내 → 쪽 2(쪽 나눔 표시로 시작): 모집 표와 그림 → 쪽 3(세로 위치가 다시 작아짐): 접수 안내
const section =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hs:sec ${NS}>` +
  p("한국시험공사 2026년도 하반기 신입사원 채용 공고", { vertpos: 0 }) +
  p("한국시험공사에서 다음과 같이 신입사원을 채용하오니 많은 지원 바랍니다.", { vertpos: 1600 }) +
  p("※ 최종합격자는 3개월간 수습기간을 둡니다.", { vertpos: 3200 }) +
  p("1. 모집분야 및 인원", { vertpos: 0, pageBreak: true }) +
  table(
    [
      ["모집분야", "인원", "근무지"],
      ["사무직", "1,500명", "서울 본사"],
      ["기술직", "30명", "부산 지사"],
    ],
    1600,
  ) +
  p("문의:<hp:tab/>인사팀<hp:lineBreak/>02-1234-5678", { vertpos: 7400 }) +
  picture +
  p("2. 접수기간 및 방법", { vertpos: 0 }) +
  p("접수기간: 2026.11.03(화) 18:00까지", { vertpos: 1600 }) +
  p("서류가 접수되면 개별 연락 드릴께요.", { vertpos: 3200 }) +
  `</hs:sec>`;

const contentHpf =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="" unique-identifier="" id="">` +
  `<opf:metadata><opf:title>시험용 채용 공고</opf:title></opf:metadata>` +
  `<opf:manifest>` +
  `<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>` +
  `<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>` +
  `<opf:item id="image1" href="BinData/image1.png" media-type="image/png" isEmbeded="1"/>` +
  `</opf:manifest>` +
  `<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine>` +
  `</opf:package>`;

// 가로세로 1픽셀짜리 PNG 그림
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const zip = new JSZip();
// mimetype은 압축하지 않고 맨 앞에 둔다 (형식 규칙)
zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
zip.file(
  "version.xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="0"/>`,
);
zip.file(
  "META-INF/container.xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>`,
);
zip.file("Contents/content.hpf", contentHpf);
zip.file("Contents/header.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" version="1.4" secCnt="1"/>`);
zip.file("Contents/section0.xml", section);
zip.file("BinData/image1.png", PNG);
zip.file("Preview/PrvText.txt", "한국시험공사 2026년도 하반기 신입사원 채용 공고");

await mkdir("samples/generated", { recursive: true });
await writeFile("samples/generated/test-made.hwpx", await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
// 손상된 파일 시험용: 앞부분만 잘라 낸 파일
const full = await zip.generateAsync({ type: "nodebuffer" });
await writeFile("samples/generated/test-broken.hwpx", full.subarray(0, 200));
console.log("만든 파일: samples/generated/test-made.hwpx, samples/generated/test-broken.hwpx");

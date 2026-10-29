// 한글파일이 알리오 입력용 양식(표 + 체크박스)일 때, 비교할 "항목"만 뽑아낸다.
// 양식은 항목 이름 칸 + 값 칸이 짝을 이루고, 체크박스(■ 선택 / □ 선택 안 함)가 많으며, 붙임 참조 같은 안내 문구가 들어 있다.
// 이런 글자를 문장 그대로 웹페이지와 비교하면 거의 전부 "누락"으로 나오므로, 값만 골라 비교한다. AI를 쓰지 않는다(코드로만).
import type { HwpParagraph } from "@/lib/readers/hwp-types";

export type FormItem = {
  // 비교할 글자 (항목 이름은 빼고 값만)
  text: string;
  // 값이 속한 항목 이름 (표에서 왼쪽 칸). AI에게 맥락으로만 알려 준다.
  label?: string;
  // 값이 있는 문단 번호(0부터). 위치 표시에 쓴다.
  index: number;
  // 항목 이름 칸의 글자. 웹페이지에 똑같은 글자가 있으면 짝으로 쓰이지만, 없다고 "누락"으로 올리지 않는다.
  // (이름표인지 진짜 내용인지 코드로 완전히 구분할 수 없어, 이름표이길 바라고 빼면 내용이 사라지는 것을 막는다)
  soft?: boolean;
};

const CHECKED = /[■☑✔✅▣◼]/;
const UNCHECKED = /[□☐]/;
const BOXES = /[■□☑☐✔✅▣▢◼◻]/;

// 항목 이름 칸으로 보는 글자 수 한도
const MAX_LABEL = 15;
// 값이 아니라 양식에 늘 들어 있는 안내 칸(참조·첨부 안내)의 항목 이름
const META_LABELS = /^(붙임\s*\d*|원문\s*URL|미첨부\s*사유|공고문|입사지원서|직무기술서|기타\s*첨부파일|첨부\s*파일)$/;
// 값 줄이 첨부 안내인 경우 (예: "붙임1 참조", "* 붙임1. 공고문")
const META_VALUE = /^\*?\s*붙임\s*\d|^붙임\s*\d*\s*참조|^별첨|^첨부\s*참조/;
// 줄 맨 앞의 불릿 기호
const BULLET = /^[ㅇ○●ㆍ·\-*▶▷◆◇※]+\s*/;

// 체크박스 줄에서 선택한(■) 값만 남긴다. 선택한 것이 없으면 빈 글자.
// 예: "□ 사업관리 ■ 경영.회계.사무 ■ 금융.보험" → "경영.회계.사무, 금융.보험"
function selectedOf(line: string): string {
  if (!BOXES.test(line)) return line.trim();
  const picks = line
    .split(/(?=[■□☑☐✔✅▣▢◼◻])/)
    .map((part) => part.trim())
    .filter((part) => part && CHECKED.test(part[0]))
    .map((part) => part.replace(BOXES, "").trim())
    .filter(Boolean);
  return picks.join(", ");
}

// 칸 하나의 글자를 비교할 줄들로 나눈다 (줄바꿈 기준, 체크박스는 선택값만, 안내 줄은 뺌)
function valueLines(text: string): string[] {
  // 체크박스 칸은 여러 줄에 걸친 선택값을 하나의 값(예: 근무지 = 서울, 부산, 대구, …)으로 합친다
  if (BOXES.test(text)) {
    const joined = text
      .split("\n")
      .map((line) => selectedOf(line.trim()))
      .filter(Boolean)
      .join(", ");
    return joined ? [joined] : [];
  }
  return text
    .split("\n")
    .map((line) => selectedOf(line.trim()))
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !META_VALUE.test(line));
}

const isLabelCell = (text: string) => {
  const t = text.replace(BOXES, "").replace(/\s+/g, " ").trim();
  return t.length > 0 && t.length <= MAX_LABEL && !/^[\d.,~\-:()\s]+$/.test(t);
};

export function formItems(paragraphs: HwpParagraph[]): FormItem[] {
  // 표의 같은 행끼리 묶는다
  type Cell = { text: string; index: number };
  const out: FormItem[] = [];
  // 항목 이름+값 짝 행이 하나라도 있는 표 (양식 표)
  const formTables = new Set<number>();
  // 체크박스(■□)가 하나라도 있는 표만 알리오 입력 양식으로 본다. 일반 표(예: 직종 | 인원)는 이름표와 내용을 가를 수 없어 건드리지 않는다.
  const boxTables = new Set(paragraphs.filter((p) => p.location.table && BOXES.test(p.text)).map((p) => p.location.table!.index));
  let i = 0;
  while (i < paragraphs.length) {
    const t = paragraphs[i].location.table;
    if (!t) {
      // 표 밖 문단: 줄바꿈을 나눠 그대로 쓴다
      for (const line of valueLines(paragraphs[i].text)) out.push({ text: line.replace(BULLET, "") || line, index: i });
      i++;
      continue;
    }
    const row: Cell[] = [];
    while (i < paragraphs.length && paragraphs[i].location.table?.index === t.index && paragraphs[i].location.table?.row === t.row) {
      row.push({ text: paragraphs[i].text, index: i });
      i++;
    }

    // 항목 이름 칸 + 값 칸 짝으로 이루어진 행 (칸 2개 또는 4개, 이름 칸이 짧음)
    // 값 칸이 체크박스·숫자·긴 글·여러 줄이어야 양식으로 본다. 짧은 글 두 칸(예: "사무직 | 행정직")은 둘 다 내용일 수 있어 양식으로 보지 않는다.
    const richValue = (text: string) => BOXES.test(text) || /\d/.test(text) || text.length > 15 || text.includes("\n");
    const isForm =
      boxTables.has(t.index) &&
      (row.length === 2 || row.length === 4) && row.every((c, k) => (k % 2 === 0 ? isLabelCell(c.text) : richValue(c.text)));
    if (isForm) {
      formTables.add(t.index);
      for (let k = 0; k < row.length; k += 2) {
        const label = row[k].text.replace(BOXES, "").replace(/\s+/g, " ").trim();
        if (META_LABELS.test(label)) continue;
        out.push({ text: label, index: row[k].index, soft: true });
        for (const line of valueLines(row[k + 1].text)) out.push({ text: line.replace(BULLET, "") || line, label, index: row[k + 1].index });
      }
      continue;
    }

    // 항목 이름 칸 하나뿐인 행(값이 비어 있는 항목, 예: "미첨부 사유")은 비교할 값이 없다
    if (row.length === 1 && formTables.has(t.index) && isLabelCell(row[0].text) && valueLines(row[0].text).length <= 1) continue;

    // 짝을 알 수 없는 행(일반 표): 짧은 칸들은 한 줄로 이어 비교하고, 긴 글은 따로 비교한다
    let pending: FormItem | null = null;
    for (const c of row) {
      for (const line of valueLines(c.text)) {
        const text = line.replace(BULLET, "") || line;
        if (text.length <= 40 && pending && pending.text.length <= 80) {
          pending.text += ` ${text}`;
        } else {
          pending = { text, index: c.index };
          out.push(pending);
        }
      }
    }
  }
  return out;
}

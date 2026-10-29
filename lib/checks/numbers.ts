// Design Ref: DESIGN.md §1 지키는 원칙 — 숫자·날짜 비교는 AI에만 맡기지 않는다.
// AI가 짝지은 두 문장의 숫자·금액·날짜·인원·전화번호를 코드가 한 글자씩 다시 대조한다.
// Plan SC: 숫자·날짜 불일치 검출률 100%, 값이 같아도 표기가 다르면 불일치 (PRD.md 5번)

// 숫자 덩어리: 1,500 / 2026.11.03 / 02-1234-5678 / 18:00 / 3.5 처럼 숫자 사이에 구분 기호가 낀 것까지 한 덩어리로 본다
const NUMBER_TOKEN = /\d+(?:[.,:\-/]\d+)*/g;

export function numberTokens(text: string): string[] {
  return text.match(NUMBER_TOKEN) ?? [];
}

export type NumberMismatch = { hwp: string; web: string };

// 한쪽에만 있는 숫자 덩어리를 센다 (문장 순서가 달라도 같은 숫자면 맞는 것으로 본다)
function leftover(from: string[], minus: string[]): string[] {
  const rest = [...minus];
  return from.filter((t) => {
    const i = rest.indexOf(t);
    if (i === -1) return true;
    rest.splice(i, 1);
    return false;
  });
}

// 두 문장의 숫자 덩어리를 한 글자씩 대조한다. 하나라도 다르면 서로 다른 덩어리를 돌려준다.
export function findNumberMismatch(hwpText: string, webText: string): NumberMismatch | null {
  const a = numberTokens(hwpText);
  const b = numberTokens(webText);
  const onlyHwp = leftover(a, b);
  const onlyWeb = leftover(b, a);
  if (onlyHwp.length === 0 && onlyWeb.length === 0) return null;
  return { hwp: onlyHwp[0] ?? "(없음)", web: onlyWeb[0] ?? "(없음)" };
}

// 띄어쓰기만 다른 두 문장은 같은 문장으로 본다 (AI가 잘못 "다름"이라 한 경우를 걸러 오탐을 줄인다)
export function sameIgnoringSpaces(a: string, b: string): boolean {
  return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
}

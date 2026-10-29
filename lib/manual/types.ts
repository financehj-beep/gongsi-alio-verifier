// Design Ref: DESIGN.md §3 4단계·§5 매뉴얼 — 매뉴얼에서 꺼낸 조항 모양

// 조항 하나: 위반 결과에 "제3장 3.1항 (15쪽)"처럼 근거를 적을 때 쓴다 (PRD.md 5번 must 2)
export type ManualClause = {
  // 화면에 보일 조항 이름. 예: "제3장 3.1항", "제5조", "문단 7"
  label: string;
  // 속한 장. 예: "제3장 채용공시"
  chapter?: string;
  // 항 번호. 예: "3.1"
  number: string;
  // 조항 내용(이어지는 줄 포함)
  text: string;
  // 쪽 번호. 쪽을 알 수 없는 파일(한글파일 매뉴얼 등)이면 없다
  page?: number;
};

export type ManualDoc = {
  fileName: string;
  format: "pdf" | "hwp" | "hwpx";
  clauses: ManualClause[];
  // 조항 번호(제N장 N.M, 제N조)를 알아볼 수 있었는지. 아니면 문단 순서로 나눈다.
  structured: boolean;
  pageKnown: boolean;
  pageCount?: number;
  charCount: number;
};

export type ManualReadError = {
  code: "format" | "size" | "encrypted" | "distribution" | "damaged" | "empty" | "unsupported";
  message: string;
};

// DESIGN.md §7 "매뉴얼 교체 때의 오류" 표의 안내 문구
export const MANUAL_ERRORS: Record<ManualReadError["code"], string> = {
  format: ".hwp·.hwpx·PDF 파일만 매뉴얼로 쓸 수 있습니다.",
  size: "매뉴얼 파일이 20MB를 넘습니다. 용량을 줄인 파일을 올려 주세요.",
  encrypted: "암호가 걸린 매뉴얼 파일입니다. 암호를 푼 파일을 올려 주세요.",
  distribution: "복사가 막힌 배포용 문서입니다. 일반 문서로 저장해 올려 주세요.",
  damaged: "파일이 손상되어 열 수 없습니다. 다시 받은 파일을 올려 주세요.",
  empty: "매뉴얼에서 글자를 찾지 못했습니다 (스캔 이미지 PDF 등). 글자가 들어 있는 파일을 올려 주세요.",
  unsupported: "읽을 수 없는 매뉴얼 형식입니다. .hwpx나 PDF로 저장해 올려 주세요.",
};

export type ManualReadResult = { ok: true; manual: ManualDoc } | { ok: false; error: ManualReadError };

export function manualFail(code: ManualReadError["code"]): { ok: false; error: ManualReadError } {
  return { ok: false, error: { code, message: MANUAL_ERRORS[code] } };
}

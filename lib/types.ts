// Design Ref: DESIGN.md §5 — 모든 검사 단계가 함께 쓰는 결과 데이터 모양

// 결과 카테고리는 5개로 고정한다 (PRD.md 5번)
export const CATEGORIES = ["불일치", "누락", "확인 필요", "맞춤법", "규칙 위반"] as const;
export type Category = (typeof CATEGORIES)[number];

// 글자를 어디서 읽었는지
export type Source = "본문" | "이미지";

// 한글파일 안의 위치. 쪽 번호를 모르면 page 없이 문단 순서만 쓴다.
export type HwpLocation = {
  page?: number;
  paragraph: number;
  table?: { index: number; row: number; col: number };
};

// 웹페이지 안의 위치: 가장 가까운 소제목과 그 아래 몇 번째 문장인지
export type WebLocation = {
  heading: string;
  sentence: number;
};

// 이미지에서 읽은 글자의 위치
export type ImageLocation = {
  side: "한글파일" | "웹페이지";
  index: number;
  area: "위" | "가운데" | "아래";
};

export type Finding = {
  category: Category;
  source: Source;
  hwpLocation?: HwpLocation;
  webLocation?: WebLocation;
  imageLocation?: ImageLocation;
  // 누락일 때만: 내용이 없는 쪽
  missingSide?: "한글파일" | "웹페이지";
  // 문장은 원문 그대로. 해당 쪽에 내용이 없으면 비워 둔다.
  hwpText?: string;
  webText?: string;
  // 강조할 다른 글자 (예: "1,500" ↔ "1,050")
  diff?: { hwp: string; web: string };
  // 맞춤법일 때만
  suggestion?: string;
  // 규칙 위반일 때만. 페이지를 모르면 항목 번호만 쓴다.
  manualClause?: { item: string; page?: number; quote?: string };
  explanation: string;
};

// 매뉴얼 이력 한 줄. storage 값은 서버 안에서만 쓰고 화면에는 보내지 않는다.
export type ManualVersion = {
  version: number;
  fileName: string;
  pageCount?: number;
  clauseCount?: number;
  replacedAt: string;
  isCurrent: boolean;
  storage: { originalPath: string; textPath: string };
};

// 화면에 보내는 이력 한 줄 (저장 위치 제외)
export type PublicManualVersion = Omit<ManualVersion, "storage">;

// Design Ref: DESIGN.md §3 1단계 읽기 4번 — 이미지에서 읽은 글자와 위치(몇 번째 이미지, 위·가운데·아래)
import type { ImageLocation } from "@/lib/types";

export type ImageLine = {
  area: ImageLocation["area"];
  text: string;
  // 글자를 또렷하게 읽었는지. 흐리거나 잘려 불확실하면 false → 불일치 대신 "확인 필요"로 분류한다 (PRD.md 5번)
  clear: boolean;
};

export type ImageText = {
  side: ImageLocation["side"];
  index: number;
  lines: ImageLine[];
};

// 이미지 글자 읽기 결과 요약: 화면이 "N장 중 M장을 읽지 못함"을 알릴 때 쓴다
export type ImageStats = { total: number; failed: number };

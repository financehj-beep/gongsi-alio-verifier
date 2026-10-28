import type { HwpLocation } from "@/lib/types";

// .hwpx·.hwp 읽기가 함께 쓰는 결과 모양 (DESIGN.md §3 1단계 읽기 3번)

export type HwpParagraph = { text: string; location: HwpLocation };

// 파일 안의 그림. 그림 속 글자는 이미지 글자 읽기(PLAN.md 15번)에서 읽는다.
export type HwpImage = { index: number; path: string; mime: string; size: number };

export type HwpDocument = {
  format: "hwpx" | "hwp";
  paragraphs: HwpParagraph[];
  images: HwpImage[];
  // 파일에 쪽 나눔 정보가 있어 쪽 번호를 알 수 있었는지
  pageKnown: boolean;
  pageCount?: number;
  charCount: number;
};

export type HwpReadError = {
  code: "damaged" | "encrypted" | "distribution" | "empty" | "unsupported";
  message: string;
};

export const HWP_ERRORS: Record<HwpReadError["code"], string> = {
  damaged: "파일이 손상되어 열 수 없습니다. 부점에 다시 요청해 주세요.",
  encrypted: "암호가 걸린 한글파일입니다. 부점에 암호 없는 파일을 요청해 주세요.",
  distribution: "복사가 막힌 배포용 문서입니다. 부점에 일반 문서를 요청해 주세요.",
  empty: "한글파일에서 글자를 찾지 못했습니다. 사진만 있는 문서인지 확인하거나 부점에 글자가 든 파일을 요청해 주세요.",
  unsupported: "아직 읽을 수 없는 한글파일 형식입니다.",
};

export type HwpReadResult = { ok: true; doc: HwpDocument } | { ok: false; error: HwpReadError };

export function hwpFail(code: HwpReadError["code"]): { ok: false; error: HwpReadError } {
  return { ok: false, error: { code, message: HWP_ERRORS[code] } };
}

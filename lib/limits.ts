// 화면과 서버가 함께 쓰는 업로드 제한 (PRD.md 5번, DESIGN.md §6)

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

// 검증할 한글파일
export const VERIFY_EXTENSIONS = [".hwp", ".hwpx"] as const;
// 매뉴얼 파일
export const MANUAL_EXTENSIONS = [".hwp", ".hwpx", ".pdf"] as const;

// 업로드할 때 붙이는 파일 형식 표시. 브라우저가 한글파일 형식을 모르는 경우가 많아 직접 정한다.
export const CONTENT_TYPES: Record<string, string> = {
  ".hwp": "application/x-hwp",
  ".hwpx": "application/hwp+zip",
  ".pdf": "application/pdf",
};

// 저장 공간 폴더: 임시 파일은 tmp/, 매뉴얼은 manuals/ (DESIGN.md §3)
export const TMP_PREFIX = "tmp/";
export const MANUAL_PREFIX = "manuals/";

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

// 검증 파일을 고르자마자 확인한다. 문제가 없으면 null.
export function checkVerifyFile(file: { name: string; size: number }): string | null {
  const ext = extensionOf(file.name);
  if (!(VERIFY_EXTENSIONS as readonly string[]).includes(ext)) {
    return ".hwp·.hwpx 파일만 검증할 수 있습니다.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "파일이 20MB를 넘습니다. 부점에 용량을 줄인 파일을 요청해 주세요.";
  }
  return null;
}

export function checkUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "http:// 또는 https://로 시작하는 주소를 넣어 주세요.";
    }
    return null;
  } catch {
    return "웹페이지 주소 형식이 올바르지 않습니다.";
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

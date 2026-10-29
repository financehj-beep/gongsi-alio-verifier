import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Design Ref: DESIGN.md §8 보안 — 입구 잠금. 주소를 아는 누구나 AI 검사(요금)를 돌리거나 기준 매뉴얼을 바꾸지 못하게,
// 모든 화면과 서버 기능(API)에 공용 암호 하나를 요구한다 (브라우저의 기본 암호 창, Basic 인증).
// 암호는 .env의 APP_PASSWORD에서 읽는다. 코드·화면·로그에 암호를 적지 않는다.

// 두 글자열이 같은지 비교한다. 틀린 위치에 따라 걸리는 시간이 달라지지 않게 끝까지 비교한다.
function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function askPassword() {
  return new NextResponse("암호가 필요합니다.", {
    status: 401,
    // 창 제목은 영문만 쓸 수 있다
    headers: { "WWW-Authenticate": 'Basic realm="Gongsi Verifier", charset="UTF-8"', "Cache-Control": "no-store" },
  });
}

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;

  // 암호가 설정되지 않았을 때: 배포본은 문을 잠근 채로 두고(실수로 열어 두지 않기 위해), 내 컴퓨터 개발 중에는 그냥 연다.
  if (!password) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("입구 암호(APP_PASSWORD)가 설정되지 않아 접속을 막았습니다. 관리자에게 설정을 요청해 주세요.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.next();
  }

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      // "사용자이름:암호" 모양. 사용자 이름은 아무거나 괜찮고 암호만 확인한다.
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0)));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (decoded.includes(":") && sameText(given, password)) return NextResponse.next();
    } catch {
      // 형식이 깨진 값은 틀린 암호로 본다
    }
  }
  return askPassword();
}

export const config = {
  // 화면과 API 전부를 지킨다. 브라우저가 암호 확인 뒤에 받는 정적 파일만 제외한다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

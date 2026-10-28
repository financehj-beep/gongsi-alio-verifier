import { connection } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import {
  CONTENT_TYPES,
  MANUAL_EXTENSIONS,
  MANUAL_PREFIX,
  MAX_FILE_BYTES,
  TMP_PREFIX,
  VERIFY_EXTENSIONS,
  extensionOf,
} from "@/lib/limits";
import { cleanupOldTmpFiles, hasBlobToken } from "@/lib/storage/blob";

// Design Ref: DESIGN.md §6 업로드 허가 받기
// 화면이 저장 공간에 파일을 바로 올릴 수 있게 1회용 허가를 내준다.
// 크기·형식·폴더를 서버가 정해서, 화면 확인을 건너뛰어도 막힌다.
const RULES = {
  verify: { prefix: TMP_PREFIX, extensions: VERIFY_EXTENSIONS as readonly string[] },
  manual: { prefix: `${MANUAL_PREFIX}uploads/`, extensions: MANUAL_EXTENSIONS as readonly string[] },
};

// 화면이 올리기 전에 보관함이 연결되어 있는지 물어본다
export async function GET() {
  await connection();
  return Response.json({ ready: hasBlobToken() });
}

export async function POST(request: Request) {
  if (!hasBlobToken()) {
    return Response.json(
      { error: "파일 보관함이 아직 연결되지 않았습니다. 관리자에게 보관함 연결을 요청해 주세요." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const kind = parseKind(clientPayload);
        const rule = RULES[kind];
        const ext = extensionOf(pathname);
        if (!pathname.startsWith(rule.prefix) || pathname.includes("..")) {
          throw new Error("허용되지 않은 저장 위치입니다.");
        }
        if (!rule.extensions.includes(ext)) {
          throw new Error("허용되지 않은 파일 형식입니다.");
        }
        // 새 업로드 허가를 낼 때마다 1시간 넘은 임시 파일을 함께 지운다
        await cleanupOldTmpFiles();
        return {
          allowedContentTypes: rule.extensions.map((e) => CONTENT_TYPES[e]),
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: false,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "업로드 허가를 내주지 못했습니다.";
    return Response.json({ error: message }, { status: 400 });
  }
}

function parseKind(clientPayload: string | null): keyof typeof RULES {
  try {
    const kind = JSON.parse(clientPayload ?? "{}").kind;
    return kind === "manual" ? "manual" : "verify";
  } catch {
    return "verify";
  }
}

import { connection } from "next/server";
import { getOpenAI } from "@/lib/ai/client";

// OpenAI 연결이 되는지 확인한다. 모델 목록만 조회하므로 사용 요금이 들지 않는다.
export async function GET() {
  // 빌드 때 미리 실행되지 않고, 요청이 올 때마다 실행되게 한다
  await connection();
  // 개발 확인용이라 실제 배포본에서는 열지 않는다 (키가 살아 있는지를 외부에 알려 주지 않기 위해)
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  try {
    const page = await getOpenAI().models.list();
    return Response.json({ ok: true, message: "OpenAI에 연결되었습니다.", modelCount: page.data.length });
  } catch (error) {
    // 열쇠 값이나 자세한 오류 내용은 화면에 보내지 않는다
    const status = (error as { status?: number }).status;
    const message =
      status === 401
        ? "OpenAI 열쇠가 올바르지 않습니다. .env의 OPENAI_API_KEY를 확인해 주세요."
        : "OpenAI에 연결하지 못했습니다.";
    return Response.json({ ok: false, message }, { status: 502 });
  }
}

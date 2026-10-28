import type { HwpDocument } from "@/lib/readers/hwp-types";
import { formatHwpLocation } from "@/lib/format";

// 한글파일에서 꺼낸 글자를 위치와 함께 확인하는 미리보기 (비교 결과 화면이 생기기 전 확인용)
export default function HwpPreview({ doc }: { doc: HwpDocument }) {
  const tableCells = doc.paragraphs.filter((p) => p.location.table).length;
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h2 className="font-semibold">한글파일에서 꺼낸 글자</h2>
        <p className="text-sm text-slate-500">
          .{doc.format} · {doc.pageKnown ? `${doc.pageCount}쪽` : "쪽 정보 없음(문단 순서로 표시)"} · 문단 {doc.paragraphs.length - tableCells}개 · 표
          칸 {tableCells}개 · 그림 {doc.images.length}개 · {doc.charCount.toLocaleString()}자
        </p>
      </div>
      <ol className="max-h-[28rem] space-y-1.5 overflow-y-auto rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-950">
        {doc.paragraphs.map((p, i) => (
          <li key={i} className="grid grid-cols-[11rem_1fr] gap-3">
            <span className="text-xs text-slate-500">{formatHwpLocation(p.location).replace(/^한글파일 /, "")}</span>
            <span className="whitespace-pre-line break-words">{p.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

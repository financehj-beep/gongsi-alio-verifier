import type { WebPage } from "@/lib/readers/web";

// 웹페이지에서 꺼낸 글자를 담당자가 눈으로 확인하는 미리보기 (비교 결과 화면이 생기기 전 확인용)
export default function WebPreview({ page }: { page: WebPage }) {
  const sentenceCount = page.blocks.reduce((n, b) => n + b.sentences.length, 0);
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h2 className="font-semibold">웹페이지에서 꺼낸 글자</h2>
        <p className="text-sm text-slate-500">
          {page.title || "(제목 없음)"} · 소제목 {page.blocks.length}개 · 문장 {sentenceCount}개 · 이미지 {page.images.length}개 ·{" "}
          {page.charCount.toLocaleString()}자
        </p>
      </div>
      {page.charCount < 20 && page.images.length > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          이 공고는 본문이 그림으로 되어 있습니다. 그림 속 글자는 이미지 글자 읽기 기능에서 읽습니다.
        </p>
      )}
      <div className="max-h-[28rem] space-y-4 overflow-y-auto rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-950">
        {page.blocks.map((block, i) => (
          <div key={i}>
            {block.heading && <p className="font-semibold text-slate-700 dark:text-slate-300">{block.heading}</p>}
            <ol className="list-decimal space-y-1 pl-5">
              {block.sentences.map((s, j) => (
                <li key={j}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

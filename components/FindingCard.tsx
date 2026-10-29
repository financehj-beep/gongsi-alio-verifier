import { formatLocations, highlightPair, type Piece } from "@/lib/format";
import type { Category, Finding } from "@/lib/types";

const BADGE: Record<Category, string> = {
  불일치: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  누락: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  "확인 필요": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  맞춤법: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "규칙 위반": "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
};

function Highlighted({ pieces }: { pieces: Piece[] }) {
  return (
    <>
      {pieces.map((p, i) =>
        p.changed ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5 font-semibold text-slate-900 dark:bg-yellow-500">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

// 문장 안에서 처음 나오는 part를 강조 조각으로 나눈다
function markPart(text: string, part: string): Piece[] | null {
  const at = text.indexOf(part);
  if (at === -1) return null;
  return [
    { text: text.slice(0, at), changed: false },
    { text: part, changed: true },
    { text: text.slice(at + part.length), changed: false },
  ].filter((p) => p.text.length > 0);
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="break-words">{children}</span>
    </div>
  );
}

// Design Ref: DESIGN.md §2.1 결과 카드 — 위치, 원본·웹페이지 문장 나란히, 다른 글자 강조
export default function FindingCard({ finding, number }: { finding: Finding; number: number }) {
  const f = finding;
  const both = Boolean(f.hwpText && f.webText);
  const pair = both ? highlightPair(f.hwpText!, f.webText!) : null;
  // 한글파일 문장만 있는 카드(맞춤법 등)는 짚은 부분만 강조한다
  const marked = !pair && f.hwpText && f.diff?.hwp ? markPart(f.hwpText, f.diff.hwp) : null;

  return (
    <article className="space-y-3 rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800">
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-500">#{number}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${BADGE[f.category]}`}>{f.category}</span>
        {f.source === "이미지" && (
          <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold dark:bg-slate-700">이미지</span>
        )}
        <span className="text-slate-500">{formatLocations(f).join(" · ")}</span>
      </header>

      <div className="space-y-1">
        {(f.hwpText !== undefined || f.missingSide === "한글파일") && (
          <Line label="원본">
            {pair ? (
              <Highlighted pieces={pair.hwp} />
            ) : marked ? (
              <Highlighted pieces={marked} />
            ) : (
              f.hwpText || <em className="text-slate-400">(한글파일에 없음)</em>
            )}
          </Line>
        )}
        {(f.webText !== undefined || f.missingSide === "웹페이지") && (
          <Line label="웹페이지">
            {pair ? <Highlighted pieces={pair.web} /> : f.webText || <em className="text-slate-400">(웹페이지에 없음)</em>}
          </Line>
        )}
        {f.suggestion && <Line label="고칠 표현">{f.suggestion}</Line>}
        {f.manualClause && (
          <Line label="매뉴얼 조항">
            {f.manualClause.item}
            {f.manualClause.page ? ` (${f.manualClause.page}쪽)` : ""}
          </Line>
        )}
      </div>

      <p className="text-slate-600 dark:text-slate-400">{f.explanation}</p>
    </article>
  );
}

import type { PairCheck } from "@/lib/checks/pair";

// Design Ref: DESIGN.md §2.1 경고 창 — "서로 다른 공고로 보입니다. 계속할까요?" [계속] [취소]
export default function PairWarning({
  pair,
  onContinue,
  onCancel,
}: {
  pair: PairCheck;
  onContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <section
      role="alertdialog"
      aria-labelledby="pair-warning-title"
      className="space-y-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-6 text-sm dark:border-amber-600 dark:bg-amber-950"
    >
      <h2 id="pair-warning-title" className="text-base font-bold text-amber-900 dark:text-amber-100">
        서로 다른 공고로 보입니다. 계속할까요?
      </h2>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-amber-900 dark:text-amber-100">
        <dt className="font-semibold">한글파일 제목</dt>
        <dd className="break-words">{pair.hwpTitle || "(찾지 못함)"}</dd>
        <dt className="font-semibold">웹페이지 제목</dt>
        <dd className="break-words">{pair.webTitle || "(찾지 못함)"}</dd>
        {pair.organization && (
          <>
            <dt className="font-semibold">기관명</dt>
            <dd>
              {pair.organization} — {pair.organizationFound ? "한글파일에 있음" : "한글파일에 없음"}
            </dd>
          </>
        )}
        <dt className="font-semibold">겹치는 낱말</dt>
        <dd>{Math.round(pair.overlap * 100)}% (같은 공고라면 보통 35% 이상)</dd>
      </dl>
      <p className="text-amber-800 dark:text-amber-200">
        짝이 틀리면 거의 모든 문장이 &lsquo;불일치&rsquo;로 나옵니다. URL과 한글파일이 같은 공고인지 확인해 주세요.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-amber-500 px-4 py-2 font-semibold text-amber-900 dark:text-amber-100"
        >
          취소
        </button>
        <button type="button" onClick={onContinue} className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
          계속
        </button>
      </div>
    </section>
  );
}

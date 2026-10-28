"use client";

import { useState } from "react";
import FindingCard from "@/components/FindingCard";
import { CATEGORIES, type Category, type Finding } from "@/lib/types";

export const PAGE_SIZE = 20;

// Design Ref: DESIGN.md §2.1 결과 영역 — 카테고리 탭 5개와 전체 건수, 한 화면 20건, 페이지 넘김
export default function ResultsView({ findings }: { findings: Finding[] }) {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const f of findings) counts[f.category] += 1;

  // 처음에는 건수가 있는 첫 번째 탭을 연다
  const [tab, setTab] = useState<Category>(CATEGORIES.find((c) => counts[c] > 0) ?? CATEGORIES[0]);
  const [page, setPage] = useState(1);

  const list = findings.filter((f) => f.category === tab);
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const shown = list.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">검증 결과</h2>
        <p className="text-sm text-slate-500">전체 {findings.length}건</p>
      </div>

      <div role="tablist" className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={tab === c}
            onClick={() => {
              setTab(c);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              tab === c
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {c} {counts[c]}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-slate-950">
          이 카테고리에서 찾은 문제가 없습니다.
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((f, i) => (
            <FindingCard key={(current - 1) * PAGE_SIZE + i} finding={f} number={(current - 1) * PAGE_SIZE + i + 1} />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav aria-label="결과 페이지" className="flex items-center justify-center gap-1 text-sm">
          <button
            onClick={() => setPage(current - 1)}
            disabled={current === 1}
            className="rounded px-2 py-1 disabled:opacity-40"
          >
            ‹ 이전
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              aria-current={n === current ? "page" : undefined}
              className={`min-w-8 rounded px-2 py-1 ${n === current ? "bg-slate-900 font-semibold text-white dark:bg-slate-100 dark:text-slate-900" : ""}`}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setPage(current + 1)}
            disabled={current === pageCount}
            className="rounded px-2 py-1 disabled:opacity-40"
          >
            다음 ›
          </button>
        </nav>
      )}
    </section>
  );
}

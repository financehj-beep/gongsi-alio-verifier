"use client";

import { useEffect, useState } from "react";

// Design Ref: DESIGN.md §2.1 진행 상황 — 4단계 중 어디까지 왔는지, 검증 중일 때만 보인다
export const STEPS = ["읽기", "비교", "맞춤법", "매뉴얼"] as const;
export type StepName = (typeof STEPS)[number];
export type StepState = "waiting" | "active" | "done" | "error" | "unavailable";

const ICON: Record<StepState, string> = {
  waiting: "○",
  active: "●",
  done: "✓",
  error: "!",
  unavailable: "–",
};

const LABEL: Record<StepState, string> = {
  waiting: "대기",
  active: "진행 중",
  done: "완료",
  error: "실패",
  unavailable: "준비 중인 기능",
};

const STYLE: Record<StepState, string> = {
  waiting: "border-slate-200 text-slate-400 dark:border-slate-700",
  active: "border-sky-400 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  done: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  error: "border-red-300 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
  unavailable: "border-dashed border-slate-200 text-slate-400 dark:border-slate-700",
};

// 진행 중인 단계가 몇 초째인지 보여준다 (DESIGN.md §3 처리 시간 배분: 단계마다 목표 10~20초)
function useElapsedSeconds(running: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => {
      clearInterval(timer);
      setSeconds(0);
    };
  }, [running]);
  return seconds;
}

export default function ProgressSteps({ states, detail }: { states: Record<StepName, StepState>; detail?: string }) {
  const active = STEPS.find((s) => states[s] === "active");
  const seconds = useElapsedSeconds(Boolean(active));

  return (
    <section
      aria-label="진행 상황"
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((name, i) => {
          const state = states[name];
          return (
            <li
              key={name}
              aria-current={state === "active" ? "step" : undefined}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${STYLE[state]}`}
            >
              <span aria-hidden className={`font-bold ${state === "active" ? "animate-pulse" : ""}`}>
                {ICON[state]}
              </span>
              <span className="font-semibold">
                {i + 1}. {name}
              </span>
              <span className="ml-auto text-xs">{LABEL[state]}</span>
            </li>
          );
        })}
      </ol>
      {(active || detail) && (
        <p className="text-sm text-slate-500">
          {active && `${active} 단계 진행 중… ${seconds}초`}
          {active && detail && " · "}
          {detail}
        </p>
      )}
    </section>
  );
}

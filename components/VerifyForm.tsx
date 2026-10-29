"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  CONTENT_TYPES,
  TMP_PREFIX,
  checkUrl,
  checkVerifyFile,
  extensionOf,
  formatBytes,
} from "@/lib/limits";
import type { WebPage } from "@/lib/readers/web";
import type { HwpDocument } from "@/lib/readers/hwp-types";
import WebPreview from "@/components/WebPreview";
import HwpPreview from "@/components/HwpPreview";
import PairWarning from "@/components/PairWarning";
import type { PairCheck } from "@/lib/checks/pair";
import ProgressSteps, { type StepName, type StepState } from "@/components/ProgressSteps";
import ResultsView from "@/components/ResultsView";
import type { Finding } from "@/lib/types";

// 지금까지 만든 단계. 매뉴얼은 아직 만들지 않아 "준비 중"으로 보인다.
const BUILT: StepName[] = ["읽기", "비교", "맞춤법"];

// 지금 단계 앞은 완료, 지금 단계는 진행 중(또는 실패), 뒤는 대기로 표시한다
function statesAt(current: StepName | "끝", mode: "active" | "error" | "done" = "active"): Record<StepName, StepState> {
  const at = current === "끝" ? BUILT.length : BUILT.indexOf(current);
  const states = { 매뉴얼: "unavailable" } as Record<StepName, StepState>;
  BUILT.forEach((step, i) => {
    states[step] = i < at ? "done" : i === at ? mode : "waiting";
  });
  return states;
}

const DETAIL: Partial<Record<StepName, string>> = {
  비교: "웹페이지와 한글파일 비교 중",
  맞춤법: "한글파일 맞춤법 검사 중",
};

// 지금 상태를 4단계 진행 표시로 바꾼다
function progressOf(status: Status): { states: Record<StepName, StepState>; detail?: string } | null {
  switch (status.kind) {
    case "idle":
      return null;
    case "uploading":
      return { states: statesAt("읽기"), detail: `한글파일 올리는 중 ${status.percent}%` };
    case "reading":
      return { states: statesAt("읽기"), detail: "웹페이지와 한글파일 읽는 중" };
    case "pairWarning":
      // 읽기는 끝났고 담당자의 선택을 기다리는 중이라 시간을 세지 않는다
      return { states: statesAt("읽기", "done"), detail: "짝 확인: 담당자가 [계속] 또는 [취소]를 고를 차례" };
    case "running":
      return { states: statesAt(status.step), detail: DETAIL[status.step] };
    case "done":
      return { states: statesAt("끝") };
    case "error":
      return { states: statesAt(status.step, "error") };
  }
}

type Texts = { web: WebPage; hwp: HwpDocument };

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number }
  | { kind: "reading" }
  | ({ kind: "pairWarning"; pair: PairCheck } & Texts)
  // 비교·맞춤법 단계 진행 중. 앞 단계에서 찾은 결과를 들고 간다.
  | ({ kind: "running"; step: StepName; findings: Finding[] } & Texts)
  | ({ kind: "done"; findings: Finding[] } & Texts)
  // 실패해도 앞 단계 결과는 유지한다 (DESIGN.md §7 AI 응답 실패)
  | ({ kind: "error"; message: string; step: StepName; findings?: Finding[] } & Partial<Texts>);

// Design Ref: DESIGN.md §2.1 입력 칸 — URL 1개 + 한글파일 1개 + [검증 시작]
export default function VerifyForm() {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function onFileChange(selected: File | null) {
    setFile(selected);
    setStatus({ kind: "idle" });
    // 버튼을 누르기 전에 바로 형식과 용량을 알려준다
    setFileError(selected ? checkVerifyFile(selected) : null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const urlProblem = checkUrl(url.trim());
    setUrlError(urlProblem);
    if (!file) {
      setFileError("검증할 한글파일을 골라 주세요.");
      return;
    }
    if (urlProblem || fileError) return;

    // 큰 파일은 서버를 거치지 않고 저장 공간 tmp/ 폴더로 바로 올린다 (DESIGN.md §4.3)
    let pathname: string;
    try {
      setStatus({ kind: "uploading", percent: 0 });
      const { ready } = (await (await fetch("/api/upload")).json()) as { ready: boolean };
      if (!ready) {
        setStatus({ kind: "error", step: "읽기", message: "파일 보관함이 아직 연결되지 않았습니다." });
        return;
      }
      const ext = extensionOf(file.name);
      ({ pathname } = await upload(`${TMP_PREFIX}${crypto.randomUUID()}${ext}`, file, {
        access: "private",
        handleUploadUrl: "/api/upload",
        clientPayload: JSON.stringify({ kind: "verify" }),
        contentType: CONTENT_TYPES[ext],
        multipart: file.size > 5 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setStatus({ kind: "uploading", percent: Math.round(percentage) }),
      }));
    } catch {
      setStatus({ kind: "error", step: "읽기", message: "파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요." });
      return;
    }

    // 1단계 읽기: 웹페이지와 한글파일을 함께 읽는다. 서버는 다 읽으면 올린 파일을 바로 지운다.
    try {
      setStatus({ kind: "reading" });
      const res = await fetch("/api/verify/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), pathname }),
      });
      const data = (await res.json()) as
        | { ok: true; web: WebPage; hwp: HwpDocument; pair: PairCheck }
        | { ok: false; error: { message: string } };
      if (!data.ok) setStatus({ kind: "error", step: "읽기", message: data.error.message });
      // 짝 확인: 다른 공고로 보이면 담당자가 계속할지 고른다
      else if (!data.pair.likelySame) setStatus({ kind: "pairWarning", web: data.web, hwp: data.hwp, pair: data.pair });
      else await compare({ web: data.web, hwp: data.hwp });
    } catch {
      setStatus({ kind: "error", step: "읽기", message: "파일을 읽는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." });
    }
  }

  // 2단계 비교 → 3단계 맞춤법을 차례로 부른다. 1단계에서 받은 글자를 단계마다 다시 보낸다
  // (DESIGN.md §3 단계 사이에 글자를 넘기는 방법)
  async function compare(texts: Texts) {
    const steps: { step: StepName; url: string; body: object }[] = [
      { step: "비교", url: "/api/verify/compare", body: texts },
      { step: "맞춤법", url: "/api/verify/spelling", body: { hwp: texts.hwp } },
    ];
    let findings: Finding[] = [];
    for (const { step, url, body } of steps) {
      setStatus({ kind: "running", step, findings, ...texts });
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { ok: true; findings: Finding[] } | { ok: false; error: { message: string } };
        if (!data.ok) {
          setStatus({ kind: "error", step, message: data.error.message, findings, ...texts });
          return;
        }
        findings = [...findings, ...data.findings];
      } catch {
        setStatus({ kind: "error", step, message: `AI 검사 중 문제가 생겼습니다 (${step} 단계). 다시 시도해 주세요.`, findings, ...texts });
        return;
      }
    }
    setStatus({ kind: "done", findings, ...texts });
  }

  // 짝 확인 경고가 떠 있는 동안에는 먼저 [계속]이나 [취소]를 고르게 한다
  const busy = ["uploading", "reading", "pairWarning", "running"].includes(status.kind);
  // 지금까지 찾은 결과 (중간에 실패해도 앞 단계 결과는 보여준다)
  const findings = "findings" in status ? status.findings : undefined;
  const texts = "web" in status && status.web && status.hwp ? { web: status.web, hwp: status.hwp } : null;
  const progress = progressOf(status);

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="space-y-2">
          <label htmlFor="url" className="block font-semibold">
            ① 공시된 웹페이지 주소
          </label>
          <input
            id="url"
            type="url"
            inputMode="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlError(null);
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          />
          {urlError && <p className="text-sm text-red-600">{urlError}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor="file" className="block font-semibold">
            ② 부점 한글파일
          </label>
          <input
            id="file"
            type="file"
            accept=".hwp,.hwpx"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 dark:file:bg-slate-800"
          />
          <p className="text-sm text-slate-500">
            {file ? `${file.name} · ${formatBytes(file.size)}` : ".hwp·.hwpx, 20MB까지"}
          </p>
          {fileError && <p className="text-sm text-red-600">{fileError}</p>}
        </div>

        <div className="flex items-center justify-end gap-4">
          {status.kind === "error" && <p className="text-sm text-red-600">{status.message}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-slate-900 px-5 py-2 font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            검증 시작
          </button>
        </div>
      </form>
      {progress && <ProgressSteps states={progress.states} detail={progress.detail} />}
      {status.kind === "pairWarning" && (
        <PairWarning
          pair={status.pair}
          onContinue={() => compare({ web: status.web, hwp: status.hwp })}
          onCancel={() => setStatus({ kind: "idle" })}
        />
      )}
      {findings && (status.kind === "done" || findings.length > 0) && <ResultsView findings={findings} />}
      {texts && status.kind !== "pairWarning" && (
        // 꺼낸 글자는 필요할 때만 펼쳐 본다
        <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-300">꺼낸 글자 보기</summary>
          <div className="mt-4 space-y-4">
            <HwpPreview doc={texts.hwp} />
            <WebPreview page={texts.web} />
          </div>
        </details>
      )}
    </div>
  );
}

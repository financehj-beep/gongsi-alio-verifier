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
import ProgressSteps, { type StepName, type StepState } from "@/components/ProgressSteps";

// 지금 상태를 4단계 진행 표시로 바꾼다. 비교·맞춤법·매뉴얼은 아직 만들지 않아 "준비 중"으로 보인다.
function progressOf(status: Status): { states: Record<StepName, StepState>; detail?: string } | null {
  const later = { 비교: "unavailable", 맞춤법: "unavailable", 매뉴얼: "unavailable" } as const;
  switch (status.kind) {
    case "idle":
      return null;
    case "uploading":
      return { states: { 읽기: "active", ...later }, detail: `한글파일 올리는 중 ${status.percent}%` };
    case "reading":
      return { states: { 읽기: "active", ...later }, detail: "웹페이지와 한글파일 읽는 중" };
    case "read":
      return { states: { 읽기: "done", ...later } };
    case "error":
      return { states: { 읽기: "error", ...later } };
  }
}

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number }
  | { kind: "reading" }
  | { kind: "read"; web: WebPage; hwp: HwpDocument }
  | { kind: "error"; message: string };

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
        setStatus({ kind: "error", message: "파일 보관함이 아직 연결되지 않았습니다." });
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
      setStatus({ kind: "error", message: "파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요." });
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
        | { ok: true; web: WebPage; hwp: HwpDocument }
        | { ok: false; error: { message: string } };
      setStatus(data.ok ? { kind: "read", web: data.web, hwp: data.hwp } : { kind: "error", message: data.error.message });
    } catch {
      setStatus({ kind: "error", message: "파일을 읽는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." });
    }
  }

  const busy = status.kind === "uploading" || status.kind === "reading";
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
      {status.kind === "read" && <HwpPreview doc={status.hwp} />}
      {status.kind === "read" && <WebPreview page={status.web} />}
    </div>
  );
}

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

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number }
  | { kind: "uploaded"; pathname: string }
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
    try {
      setStatus({ kind: "uploading", percent: 0 });
      const { ready } = (await (await fetch("/api/upload")).json()) as { ready: boolean };
      if (!ready) {
        setStatus({ kind: "error", message: "파일 보관함이 아직 연결되지 않았습니다." });
        return;
      }
      const ext = extensionOf(file.name);
      const blob = await upload(`${TMP_PREFIX}${crypto.randomUUID()}${ext}`, file, {
        access: "private",
        handleUploadUrl: "/api/upload",
        clientPayload: JSON.stringify({ kind: "verify" }),
        contentType: CONTENT_TYPES[ext],
        multipart: file.size > 5 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setStatus({ kind: "uploading", percent: Math.round(percentage) }),
      });
      // 1단계 읽기(묶음 2)가 생기면 여기서 이어서 검증을 시작한다
      setStatus({ kind: "uploaded", pathname: blob.pathname });
    } catch {
      setStatus({ kind: "error", message: "파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
  }

  const busy = status.kind === "uploading";

  return (
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
        {status.kind === "uploading" && <p className="text-sm text-slate-500">파일 올리는 중… {status.percent}%</p>}
        {status.kind === "uploaded" && (
          <p className="text-sm text-emerald-600">파일을 올렸습니다. 검사 단계는 다음 묶음에서 연결됩니다.</p>
        )}
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
  );
}

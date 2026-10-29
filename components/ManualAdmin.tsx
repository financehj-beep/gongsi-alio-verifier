"use client";

import { useCallback, useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { CONTENT_TYPES, MANUAL_EXTENSIONS, MAX_FILE_BYTES, extensionOf, formatBytes } from "@/lib/limits";
import type { PublicManualVersion } from "@/lib/types";

type Preview = { fileName: string; pageCount?: number; pageKnown: boolean; clauseCount: number };
type Api<T> = ({ ok: true } & T) | { ok: false; error: { message: string } };

const dateOf = (iso: string) => iso.slice(0, 10);
const sizeText = (v: { pageCount?: number; clauseCount?: number }) =>
  v.pageCount ? `${v.pageCount}쪽` : `조항 ${v.clauseCount ?? 0}개`;

async function replaceCall(body: object) {
  const res = await fetch("/api/manual/replace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Api<{ preview?: Preview; version?: PublicManualVersion }>;
}

// Design Ref: DESIGN.md §2.2 — 새 파일을 고르면 파일명·쪽수를 보여주고 [확인]을 눌러야 교체된다. [취소]하면 올린 파일을 지운다.
export default function ManualAdmin() {
  const [versions, setVersions] = useState<PublicManualVersion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ pathname: string; preview: Preview } | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = (await (await fetch("/api/manual/history")).json()) as Api<{ versions: PublicManualVersion[] }>;
      if (data.ok) setVersions(data.versions);
      else setLoadError(data.error.message);
    } catch {
      setLoadError("매뉴얼 이력을 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function onFile(file: File | null) {
    setMessage(null);
    if (!file) return;
    const ext = extensionOf(file.name);
    if (!(MANUAL_EXTENSIONS as readonly string[]).includes(ext)) {
      setMessage({ kind: "error", text: ".hwp·.hwpx·PDF 파일만 매뉴얼로 쓸 수 있습니다." });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMessage({ kind: "error", text: "매뉴얼 파일이 20MB를 넘습니다. 용량을 줄인 파일을 올려 주세요." });
      return;
    }
    try {
      setBusy("올리는 중 0%");
      const { pathname } = await upload(`manuals/uploads/${crypto.randomUUID()}${ext}`, file, {
        access: "private",
        handleUploadUrl: "/api/upload",
        clientPayload: JSON.stringify({ kind: "manual" }),
        contentType: CONTENT_TYPES[ext],
        multipart: file.size > 5 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setBusy(`올리는 중 ${Math.round(percentage)}%`),
      });
      setBusy("매뉴얼 읽는 중");
      const data = await replaceCall({ action: "preview", pathname, fileName: file.name });
      if (data.ok && data.preview) setPending({ pathname, preview: data.preview });
      else if (!data.ok) setMessage({ kind: "error", text: `${data.error.message} (현재 매뉴얼은 그대로입니다)` });
    } catch {
      setMessage({ kind: "error", text: "파일을 올리지 못했습니다. 현재 매뉴얼은 그대로입니다." });
    } finally {
      setBusy(null);
      setInputKey((k) => k + 1);
    }
  }

  async function onConfirm() {
    if (!pending) return;
    setBusy("교체 중");
    try {
      const data = await replaceCall({ action: "confirm", pathname: pending.pathname, fileName: pending.preview.fileName });
      if (data.ok) {
        setMessage({ kind: "ok", text: `${pending.preview.fileName}로 교체했습니다.` });
        await load();
      } else {
        setMessage({ kind: "error", text: `${data.error.message} (현재 매뉴얼은 그대로입니다)` });
      }
    } catch {
      setMessage({ kind: "error", text: "교체하지 못했습니다. 현재 매뉴얼은 그대로입니다." });
    } finally {
      setPending(null);
      setBusy(null);
    }
  }

  async function onCancel() {
    if (!pending) return;
    const { pathname } = pending;
    setPending(null);
    // 올렸던 새 파일을 바로 지운다
    await replaceCall({ action: "cancel", pathname }).catch(() => null);
    setMessage({ kind: "ok", text: "교체를 취소했습니다. 현재 매뉴얼은 그대로입니다." });
  }

  const current = versions?.find((v) => v.isCurrent);
  const card = "space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900";

  return (
    <div className="space-y-6">
      <section className={card}>
        <h2 className="font-semibold">현재 매뉴얼</h2>
        {loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : !current ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : (
          <p>
            {current.fileName} · {sizeText(current)} · {dateOf(current.replacedAt)} 교체
          </p>
        )}
      </section>

      <section className={card}>
        <h2 className="font-semibold">새 매뉴얼로 교체</h2>
        <input
          key={inputKey}
          type="file"
          accept=".hwp,.hwpx,.pdf"
          disabled={!!busy || !!pending}
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 dark:file:bg-slate-800"
        />
        <p className="text-sm text-slate-500">.hwp·.hwpx·PDF, {formatBytes(MAX_FILE_BYTES)}까지. 지금은 .hwpx와 PDF만 읽을 수 있어요.</p>
        {busy && <p className="text-sm text-sky-700 dark:text-sky-300">{busy}</p>}
        {message && (
          <p role="status" className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-emerald-700 dark:text-emerald-300"}`}>
            {message.text}
          </p>
        )}
        {pending && (
          <div role="alertdialog" aria-label="매뉴얼 교체 확인" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
            <p className="font-semibold">
              {pending.preview.fileName} ({sizeText(pending.preview)})로 교체할까요?
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">교체하면 이후 검증부터 이 매뉴얼이 기준이 되고, 이전 매뉴얼은 이력에 남습니다.</p>
            <div className="flex gap-2">
              <button onClick={() => void onConfirm()} disabled={!!busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
                확인
              </button>
              <button onClick={() => void onCancel()} disabled={!!busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600">
                취소
              </button>
            </div>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="font-semibold">버전 이력</h2>
        {!versions ? null : (
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {versions.map((v) => (
              <li key={v.version} className="flex flex-wrap items-center gap-x-4 py-2">
                <span className="font-semibold">v{v.version}</span>
                <span>{v.fileName}</span>
                <span className="text-slate-500">{sizeText(v)}</span>
                <span className="text-slate-500">{dateOf(v.replacedAt)}</span>
                {v.isCurrent && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">현재</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

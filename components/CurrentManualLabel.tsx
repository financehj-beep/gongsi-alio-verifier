"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicManualVersion } from "@/lib/types";

// Design Ref: DESIGN.md §2.1 맨 위 — 매뉴얼 관리 버튼과 지금 기준 매뉴얼(파일명·교체일)
export default function CurrentManualLabel() {
  const [current, setCurrent] = useState<PublicManualVersion | null>(null);

  useEffect(() => {
    fetch("/api/manual/history")
      .then((r) => r.json())
      .then((d: { ok: boolean; versions?: PublicManualVersion[] }) => setCurrent(d.versions?.find((v) => v.isCurrent) ?? null))
      .catch(() => null);
  }, []);

  return (
    <div className="flex items-center gap-3 text-sm">
      {current && (
        <span className="text-slate-500">
          기준 매뉴얼: {current.fileName} ({current.replacedAt.slice(0, 10)} 교체)
        </span>
      )}
      <Link href="/manual" className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold dark:border-slate-600">
        매뉴얼 관리
      </Link>
    </div>
  );
}

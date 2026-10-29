import Link from "next/link";
import ManualAdmin from "@/components/ManualAdmin";

// Design Ref: DESIGN.md §2.2 매뉴얼 관리 화면 — 현재 매뉴얼, 새 매뉴얼로 교체, 버전 이력
export default function ManualPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-sm text-slate-600 hover:underline dark:text-slate-300">
            ← 검증 화면으로
          </Link>
          <h1 className="text-lg font-bold">매뉴얼 관리</h1>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <ManualAdmin />
      </main>
    </div>
  );
}

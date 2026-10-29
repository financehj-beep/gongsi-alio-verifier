import CurrentManualLabel from "@/components/CurrentManualLabel";
import VerifyForm from "@/components/VerifyForm";

// Design Ref: DESIGN.md §2.1 — 검증 화면 (맨 위 제목줄 → 입력 칸 → 진행 상황 → 결과)
export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold">공시 알리오 사전검증기</h1>
          <CurrentManualLabel />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <VerifyForm />
      </main>
    </div>
  );
}

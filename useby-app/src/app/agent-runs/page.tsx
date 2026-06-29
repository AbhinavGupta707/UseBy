import Link from "next/link";
import { AgentRunsDashboard } from "../../components/agent/agent-runs-dashboard";

export default function AgentRunsPage() {
  return (
    <main className="min-h-screen bg-[#f7f3ea] text-[#17231c]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d2dbc9] pb-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-[#255c45] text-sm font-semibold text-white">
              UB
            </span>
            <span>
              <span className="block text-lg font-semibold">UseBy</span>
              <span className="block text-sm text-[#65715f]">Agent run review</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <Link
              href="/grocery"
              className="rounded-md border border-[#c4ceba] px-3 py-2 text-[#255c45] transition hover:border-[#255c45] hover:bg-white"
            >
              Grocery
            </Link>
            <Link
              href="/proof"
              className="rounded-md border border-[#c4ceba] px-3 py-2 text-[#255c45] transition hover:border-[#255c45] hover:bg-white"
            >
              Proof
            </Link>
            <Link
              href="/"
              className="rounded-md bg-[#255c45] px-3 py-2 text-white transition hover:bg-[#173d2f]"
            >
              Today
            </Link>
          </nav>
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase text-[#69786d]">Proof Surface</p>
            <h1 className="mt-2 max-w-2xl text-4xl font-semibold leading-tight text-[#17231c]">
              Agent drafts, provider status, trace metadata, and redaction proof.
            </h1>
          </div>
          <p className="self-end text-base leading-7 text-[#566250]">
            This route is for operators and demos, not the primary customer path. It keeps generated/fallback/unavailable states distinct and only shows LangSmith when a run returns a trace id.
          </p>
        </section>

        <AgentRunsDashboard />
      </div>
    </main>
  );
}

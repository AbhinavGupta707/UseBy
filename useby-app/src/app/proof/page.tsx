import Link from "next/link";
import { LiveProofDashboard } from "@/components/proof/live-proof-dashboard";

export default function ProofPage() {
  return (
    <main className="min-h-screen bg-[#f4f6f1] text-[#17231c]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d2dbc9] pb-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-[#315b44] text-sm font-semibold text-white">
              UB
            </span>
            <span>
              <span className="block text-lg font-semibold">UseBy</span>
              <span className="block text-sm text-[#65715f]">Riverside Quarter proof</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <Link
              href="/"
              className="rounded-md border border-[#c4ceba] px-3 py-2 text-[#315b44] transition hover:border-[#315b44] hover:bg-white"
            >
              Home
            </Link>
            <a
              href="#demo-controls"
              className="rounded-md bg-[#315b44] px-3 py-2 text-white transition hover:bg-[#254635]"
            >
              Demo Controls
            </a>
          </nav>
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-lg border border-[#d2dbc9] bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-[#65715f]">H0 Checkpoint 8</p>
            <h1 className="mt-2 max-w-2xl text-4xl font-semibold leading-tight text-[#17231c]">
              External integration, private-file, notification, and AI guardrail proof for the live UseBy system.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#566250]">
              This surface reads the system endpoints directly, reports missing endpoints as unavailable,
              and only treats Aurora, private uploads, Textract, geocoding, notifications, reminder jobs,
              AI copy, semantic ranking, and audit evidence as live when the backend returns that status.
              AI remains copy, explanation, or secondary ranking only, and payment stays deferred.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Aurora", "Primary state store"],
              ["S3 + Textract", "Private upload and parse readiness"],
              ["Maps privacy", "Coarse public locations"],
              ["AI guardrails", "Copy and ranking only"],
            ].map(([label, detail]) => (
              <div key={label} className="rounded-lg border border-[#d2dbc9] bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-[#65715f]">{label}</p>
                <p className="mt-2 text-sm leading-6 text-[#17231c]">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <div id="demo-controls">
          <LiveProofDashboard />
        </div>
      </div>
    </main>
  );
}

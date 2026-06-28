import Link from "next/link";

const proofItems = [
  ["Database", "Aurora PostgreSQL 17.7"],
  ["Data API", "Enabled"],
  ["Location", "PostGIS enabled"],
  ["Storage", "S3 private bucket"],
  ["Runtime", "Vercel App Router"],
  ["Live State", "Checkpoint 1 endpoint pending"],
];

export default function ProofPage() {
  return (
    <main className="min-h-screen bg-[#f7f8f4] px-6 py-8 text-[#18231d]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d7decd] pb-5">
          <Link href="/" className="text-sm font-semibold text-[#315b44]">
            UseBy
          </Link>
          <span className="text-sm text-[#66705f]">H0 proof surface</span>
        </header>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h1 className="text-4xl font-semibold tracking-normal">
              Architecture & Database Proof
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#586252]">
              This page is reserved for live Aurora evidence, table counts, job
              runs, audit events, and integration screenshots as Checkpoint 1
              lands the data foundation.
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#d7decd] bg-white">
            {proofItems.map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-[140px_1fr] border-b border-[#edf0e8] px-5 py-4 last:border-b-0"
              >
                <span className="text-sm text-[#66705f]">{label}</span>
                <span className="text-sm font-medium text-[#18231d]">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

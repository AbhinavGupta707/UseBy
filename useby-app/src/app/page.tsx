import Link from "next/link";

const stackItems = [
  ["Aurora PostgreSQL", "Primary database"],
  ["PostGIS", "Neighbourhood matching"],
  ["S3", "Receipt and item files"],
  ["Vercel", "App runtime"],
];

const checkpointRows = [
  ["0A", "Scaffold/tooling", "Done"],
  ["0B", "Design shell", "Done"],
  ["0C", "Contracts/docs", "Done"],
  ["1A", "Schema/migrations", "Ready"],
  ["1B", "Seed world", "Ready"],
  ["1C", "DB runtime/API", "Ready"],
  ["1D", "Proof UI", "Ready"],
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7f8f4] text-[#18231d]">
      <header className="border-b border-[#d7decd] bg-[#fbfcf8]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-md bg-[#315b44] text-sm font-semibold text-white">
              UB
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal">UseBy</h1>
              <p className="text-sm text-[#66705f]">Riverside Quarter</p>
            </div>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm font-medium text-[#4f5a4a]">
            {["Shelf", "Needs", "Pools", "Proof"].map((item) => (
              <Link
                key={item}
                href={item === "Proof" ? "/proof" : "#"}
                className="rounded-md px-3 py-2 hover:bg-[#edf0e8] hover:text-[#18231d]"
              >
                {item}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-lg border border-[#d7decd] bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#66705f]">
                Checkpoint 0
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-normal">
                Checkpoint 1 Ready
              </h2>
            </div>
            <span className="rounded-md bg-[#dfeadd] px-3 py-2 text-sm font-medium text-[#315b44]">
              Git-backed scaffold
            </span>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {stackItems.map(([label, detail]) => (
              <div
                key={label}
                className="rounded-md border border-[#edf0e8] bg-[#fbfcf8] p-4"
              >
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-1 text-sm text-[#66705f]">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-[#d7decd] bg-white">
          <div className="border-b border-[#edf0e8] px-5 py-4">
            <h2 className="text-base font-semibold">Orchestration Gate</h2>
          </div>
          <div className="divide-y divide-[#edf0e8]">
            {checkpointRows.map(([lane, name, state]) => (
              <div
                key={lane}
                className="grid grid-cols-[56px_1fr_72px] items-center gap-3 px-5 py-3 text-sm"
              >
                <span className="font-mono text-[#66705f]">{lane}</span>
                <span>{name}</span>
                <span className="text-right font-medium text-[#315b44]">
                  {state}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

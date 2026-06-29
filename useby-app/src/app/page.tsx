import Link from "next/link";
import { GroceryWorkspace } from "../components/grocery/grocery-workspace";

const neighbourhoodSignals = [
  ["Aurora", "Primary live state"],
  ["PostGIS", "Distance-aware matching"],
  ["Audit", "Mutation evidence"],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f4f6f1] text-[#17231c]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d2dbc9] pb-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-[#315b44] text-sm font-semibold text-white">
              UB
            </span>
            <span>
              <span className="block text-lg font-semibold">UseBy</span>
              <span className="block text-sm text-[#65715f]">Riverside Quarter</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <Link
              className="rounded-md border border-[#c4ceba] px-3 py-2 text-[#315b44] transition hover:border-[#315b44] hover:bg-white"
              href="/grocery"
            >
              Grocery
            </Link>
            <Link
              className="rounded-md border border-[#c4ceba] px-3 py-2 text-[#315b44] transition hover:border-[#315b44] hover:bg-white"
              href="/pools"
            >
              Pools
            </Link>
            <Link
              className="rounded-md border border-[#c4ceba] px-3 py-2 text-[#315b44] transition hover:border-[#315b44] hover:bg-white"
              href="/drops"
            >
              Drops
            </Link>
            <Link
              className="rounded-md bg-[#315b44] px-3 py-2 text-white transition hover:bg-[#254635]"
              href="/proof"
            >
              Proof
            </Link>
          </nav>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1fr_330px]">
          <div className="min-w-0">
            <GroceryWorkspace mode="home" />
          </div>

          <aside className="grid content-start gap-5">
            <section className="rounded-lg border border-[#d2dbc9] bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase text-[#65715f]">System proof</p>
              <h2 className="mt-1 text-xl font-semibold leading-tight text-[#17231c]">
                Live backend signals
              </h2>
              <div className="mt-4 grid gap-3">
                {neighbourhoodSignals.map(([value, label]) => (
                  <div key={label} className="rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-3">
                    <p className="font-mono text-lg font-semibold text-[#315b44]">{value}</p>
                    <p className="mt-1 text-sm leading-6 text-[#65715f]">{label}</p>
                  </div>
                ))}
              </div>
              <Link
                className="mt-4 inline-flex min-h-11 items-center rounded-md border border-[#315b44] px-4 py-2 text-sm font-semibold text-[#315b44] transition hover:bg-[#315b44] hover:text-white"
                href="/proof"
              >
                Open proof
              </Link>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

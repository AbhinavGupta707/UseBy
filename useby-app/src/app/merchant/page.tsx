import Link from "next/link";
import { MerchantWorkspace } from "../../components/merchant/merchant-workspace";

export default function MerchantPage() {
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
              <span className="block text-sm text-[#65715f]">Riverside Quarter merchants</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <Link
              href="/grocery"
              className="rounded-md border border-[#c4ceba] px-3 py-2 text-[#315b44] transition hover:border-[#315b44] hover:bg-white"
            >
              Grocery
            </Link>
            <Link
              href="/proof"
              className="rounded-md bg-[#315b44] px-3 py-2 text-white transition hover:bg-[#254635]"
            >
              Proof
            </Link>
          </nav>
        </header>

        <MerchantWorkspace />
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { ConsumerShell } from "../components/consumer/consumer-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "UseBy",
  description: "A premium neighbourhood app for using more, sharing more, and unlocking nearby food, pools, drops, and lending.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body>
        <ConsumerShell>{children}</ConsumerShell>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: {
    default: "Vestige · Know who you're funding",
    template: "%s · Vestige",
  },
  description: "Verified-human founders, signed terms and a 2-of-2 USDT treasury, checkable by anyone from one ENS name.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

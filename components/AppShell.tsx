"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ADAPTER_KIND } from "@/src/modules/ui/config";
import { shortHex } from "@/src/modules/ui/format";
import { MOCK_ROLES, useVestige, VestigeProvider, type MockRole } from "@/src/modules/ui/provider";
import { PromptHost } from "./PromptHost";

export function TestnetBanner() {
  return (
    <div className="banner-testnet" data-testid="banner-testnet">
      Testnet — not real money
      <span>Sepolia (identity) · Whitechain Sepolia (treasury)</span>
    </div>
  );
}

export function DevMockBanner() {
  if (ADAPTER_KIND !== "dev-mock") return null;
  return (
    <div className="banner-mock" data-testid="banner-devmock">
      <strong>DEV MOCK</strong> — backend responses are simulated in this browser. Nothing on this screen is verified, signed or on-chain.
    </div>
  );
}

function RoleSwitcher() {
  const { role, setRole, address, resetMock } = useVestige();
  if (ADAPTER_KIND !== "dev-mock") {
    return (
      <span className="wallet-chip" title="Wallet connection waits on H's wallet-auth decision (CONTRACTS: Wallet authentication)">
        Wallet: not connected
      </span>
    );
  }
  return (
    <div className="role-switch">
      <label htmlFor="role-select">Acting as</label>
      <select id="role-select" data-testid="role-select" value={role} onChange={(e) => setRole(e.target.value as MockRole)}>
        <option value="visitor">Visitor (no wallet)</option>
        {Object.entries(MOCK_ROLES).map(([k, r]) => (
          <option key={k} value={k}>
            {r.label}
          </option>
        ))}
      </select>
      {address && <span className="mono tiny">{shortHex(address)}</span>}
      {resetMock && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="reset-mock"
          onClick={() => {
            resetMock();
            window.location.href = "/";
          }}
        >
          Reset mock
        </button>
      )}
    </div>
  );
}

const NAV = [
  { href: "/founder", label: "Founders" },
  { href: "/funder", label: "Funders" },
  { href: "/v", label: "Verify a venture" },
];

function Header() {
  const path = usePathname() ?? "/";
  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="vestige home">
          vestige <small>day-zero ventures</small>
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href || path.startsWith(`${n.href}/`) ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="header-spacer" />
        <RoleSwitcher />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <VestigeProvider>
      <div className="shell">
        <TestnetBanner />
        <DevMockBanner />
        <Header />
        <main className="main">{children}</main>
        <footer className="footer">
          <div className="footer-inner">
            <span>vestige ventures are workspaces, not legally incorporated companies.</span>
            <span>Open evidence format · Built at ETHGlobal Mumbai 2026</span>
          </div>
        </footer>
        <PromptHost />
      </div>
    </VestigeProvider>
  );
}

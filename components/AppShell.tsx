"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { ADAPTER_KIND } from "@/src/modules/ui/config";
import { SEPOLIA_CHAIN_ID, WHITECHAIN_CHAIN_ID } from "@/src/modules/ui/types";
import { chainName } from "@/src/modules/ui/wallet/eip1193";
import { shortHex } from "@/src/modules/ui/format";
import { MOCK_ROLES, useVestige, VestigeProvider, type MockRole } from "@/src/modules/ui/provider";
import { PromptHost } from "./PromptHost";

export function TestnetBanner() {
  return (
    <div className="banner-testnet" data-testid="banner-testnet">
      Testnet — not real money
      <span>Ethereum Sepolia (identity) · Whitechain testnet 1874 (treasury)</span>
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

/**
 * LIVE: injected EIP-1193 wallet (viem only). Shows the network and offers explicit
 * switch buttons — switching only ever happens when the user presses one.
 */
function WalletControl() {
  const { address, wallet, connect, disconnect, switchChain, sessionWallet, signIn } = useVestige();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!address)
    return (
      <span className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-sm" data-testid="wallet-connect" disabled={wallet.connecting} onClick={() => void connect()}>
          {wallet.connecting ? "Connecting…" : "Connect wallet"}
        </button>
        {wallet.error && (
          <span className="tiny" style={{ color: "var(--failed)", maxWidth: 260 }} data-testid="wallet-error">
            {wallet.error}
          </span>
        )}
      </span>
    );
  const known = wallet.chainId === SEPOLIA_CHAIN_ID || wallet.chainId === WHITECHAIN_CHAIN_ID;
  const signedIn = !!sessionWallet && sessionWallet.toLowerCase() === address.toLowerCase();
  return (
    <div className="wallet-menu" data-testid="wallet-menu">
      <button type="button" className="wallet-chip" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="wallet-chip">
        <span className="mono">{shortHex(address)}</span>
        <span className={`tiny ${known ? "muted" : ""}`} style={known ? undefined : { color: "var(--failed)" }} data-testid="wallet-chain" data-chain={wallet.chainId}>
          · {chainName(wallet.chainId)}
        </span>
        {signedIn ? <span className="tiny" style={{ color: "var(--chain)" }}>· signed in</span> : <span className="tiny muted">· not signed in</span>}
      </button>
      {open && (
        <div className="wallet-pop card card-pad stack-sm" role="menu">
          <span className="tiny muted">{wallet.selected?.name ?? "Browser wallet"} · EOA</span>
          <span className="small">
            Network: <strong>{chainName(wallet.chainId)}</strong>
          </span>
          <span className="tiny muted">Sepolia is used for sign-in and founding terms; Whitechain for treasury approvals and funding.</span>
          <div className="row" style={{ gap: 6 }}>
            {[SEPOLIA_CHAIN_ID, WHITECHAIN_CHAIN_ID].map((id) => (
              <button
                key={id}
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={wallet.chainId === id}
                data-testid={`switch-${id}`}
                onClick={async () => {
                  setMsg(null);
                  const e = await switchChain(id);
                  if (e) setMsg(e.message);
                }}
              >
                {wallet.chainId === id ? `On ${chainName(id)}` : `Switch to ${chainName(id)}`}
              </button>
            ))}
          </div>
          {!signedIn ? (
            <button
              type="button"
              className="btn btn-sm"
              data-testid="wallet-signin"
              onClick={async () => {
                setMsg(null);
                const r = await signIn();
                if (!r.ok && r.error.code !== "CANCELLED") setMsg(r.error.detail ? `${r.error.message} (${r.error.detail})` : r.error.message);
              }}
            >
              Sign in (free signature)
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost btn-sm" data-testid="wallet-disconnect" onClick={() => void disconnect()}>
            {signedIn ? "Sign out & forget wallet" : "Forget wallet"}
          </button>
          {msg && (
            <span className="tiny" style={{ color: "var(--failed)" }} data-testid="wallet-menu-error">
              {msg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function RoleSwitcher() {
  const { role, setRole, address, resetMock } = useVestige();
  if (ADAPTER_KIND !== "dev-mock") return <WalletControl />;
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

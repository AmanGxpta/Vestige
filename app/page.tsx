import Link from "next/link";
import { EnsLookupForm } from "@/components/EnsLookupForm";
import { LiveVentures } from "@/components/LiveVentures";
import { Icon, VentureTile } from "@/components/brand";

const FEATURES = [
  { icon: "user" as const, tile: "tile", title: "Verified Humans", body: "Each founder is a unique, real person (via World ID)." },
  { icon: "file" as const, tile: "tile tile-lilac", title: "Signed Terms", body: "A clear founding agreement, hashed and signed by both." },
  { icon: "layers" as const, tile: "tile tile-sand", title: "Shared Treasury", body: "A 2-of-2 Safe on Whitechain no single founder can drain." },
  { icon: "eye" as const, tile: "tile tile-mint", title: "Public Proof", body: "Anyone can verify the team, terms and treasury from one link." },
];

const FLOW = [
  { icon: "pen" as const, tile: "tile tile-lilac", title: "1  Create", body: "Set up your venture and its ENS name." },
  { icon: "user" as const, tile: "tile", title: "2  Verify", body: "Both founders prove they are distinct real humans." },
  { icon: "file" as const, tile: "tile tile-lilac", title: "3  Sign", body: "Agree on founding terms; both sign the same hash." },
  { icon: "layers" as const, tile: "tile tile-sand", title: "4  Treasury", body: "Get a shared 2-of-2 USDT treasury." },
  { icon: "bolt" as const, tile: "tile", title: "5  Fund", body: "Receive grants or early funding, gas-free for you." },
];

/** Illustrative example only — clearly labelled; not a real venture or real people. */
function HeroIllustration() {
  return (
    <div className="glass-stack" aria-label="Illustration of a verified venture card">
      <div className="glass" />
      <div className="glass" />
      <div className="glass glass-front">
        <div className="row-between">
          <span className="row" style={{ gap: 12 }}>
            <VentureTile name="example" />
            <strong className="mono" style={{ fontSize: 17 }}>
              example.vestige.eth
            </strong>
          </span>
          <span className="pill pill-VERIFIED">Example</span>
        </div>
        <div className="divider" />
        <div className="glass-cols">
          <div className="stack-sm">
            <span className="small muted">Founders (2)</span>
            {["asha", "ravi"].map((n, i) => (
              <span key={n} className="row" style={{ gap: 8 }}>
                <span className="avatar" style={{ background: i ? "#7a6a4f" : "#2a2412" }}>
                  {n[0].toUpperCase()}
                </span>
                <span className="small mono">{n}</span>
                <span className="pill pill-VERIFIED" style={{ fontSize: 11 }}>
                  Human
                </span>
              </span>
            ))}
          </div>
          <div className="stack-sm">
            <span className="row" style={{ gap: 10 }}>
              <span className="tile tile-lilac" style={{ width: 34, height: 34 }}>
                <Icon name="file" size={16} />
              </span>
              <span className="small">
                <strong>Founding terms</strong>
                <br />
                <span className="muted">Signed by both</span>
              </span>
            </span>
            <span className="row" style={{ gap: 10 }}>
              <span className="tile tile-sand" style={{ width: 34, height: 34 }}>
                <Icon name="layers" size={16} />
              </span>
              <span className="small">
                <strong>Shared treasury</strong>
                <br />
                <span className="muted">2-of-2 on Whitechain</span>
              </span>
            </span>
          </div>
        </div>
      </div>
      <span className="glass-label">Illustration, not a real venture</span>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div>
      <section className="hero">
        <div className="stack" style={{ gap: 22 }}>
          <span className="tag" style={{ alignSelf: "flex-start" }}>
            For grants, accelerators and early funds
          </span>
          <h1>
            Know who you&apos;re funding, from <span className="mark">day zero.</span>
          </h1>
          <p className="lead">
            A verified startup layer for the earliest stage: real human founders, signed founding terms, and a shared treasury you can trust. A 2-of-2
            treasury means nothing if one person holds both keys; vestige proves the two signers are two different people.
          </p>
          <div className="row">
            <Link className="btn btn-lg" href="/founder" data-testid="cta-founder">
              Create a Venture <Icon name="arrow" size={17} />
            </Link>
            <Link className="btn btn-secondary btn-lg" href="/funder" data-testid="cta-funder">
              Explore Ventures
            </Link>
          </div>
        </div>
        <HeroIllustration />
      </section>

      <section className="features" aria-label="What vestige verifies">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <span className={f.tile}>
              <Icon name={f.icon} size={20} />
            </span>
            <div>
              <strong>{f.title}</strong>
              <span>{f.body}</span>
            </div>
          </div>
        ))}
      </section>

      <LiveVentures limit={6} />

      <section className="section">
        <div className="section-head">
          <div className="page-head">
            <h2>The complete flow</h2>
            <p className="small">From a team idea to a verifiable, fundable venture. Founders never touch gas or a seed phrase.</p>
          </div>
        </div>
        <div className="flow">
          {FLOW.map((s) => (
            <div key={s.title} className="card flow-step">
              <span className={s.tile}>
                <Icon name={s.icon} size={20} />
              </span>
              <strong style={{ whiteSpace: "pre" }}>{s.title}</strong>
              <span>{s.body}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section grid-2" style={{ alignItems: "start" }}>
        <div className="card card-pad stack" data-testid="entry-verify">
          <span className="row" style={{ gap: 12 }}>
            <span className="tile tile-mint">
              <Icon name="shield" size={20} />
            </span>
            <span>
              <h3>Verify any venture</h3>
              <span className="small muted">We resolve its ENS name on Ethereum, then read the treasury straight from Whitechain, not from our database.</span>
            </span>
          </span>
          <EnsLookupForm compact />
        </div>
        <div className="card card-pad stack-sm">
          <span className="eyebrow">How every claim is labelled</span>
          <div className="claims small">
            <p>
              <span className="badge badge-HUMAN_VERIFIED">HUMAN_VERIFIED</span> a World ID proof of unique humanity, checked by the vestige server.
            </p>
            <p>
              <span className="badge badge-SIGNED">SIGNED</span> an EIP-712 signature from the founder&apos;s own wallet.
            </p>
            <p>
              <span className="badge badge-CHAIN_VERIFIED">CHAIN_VERIFIED</span> a receipt on Sepolia or Whitechain, read independently.
            </p>
            <p>
              <span className="badge badge-SELF_REPORTED">SELF_REPORTED</span> entered by the team; not independently checked.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

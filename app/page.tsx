import Link from "next/link";
import { EnsLookupForm } from "@/components/EnsLookupForm";

function KeyRow({ color, initial, text, sub }: { color: string; initial: string; text: string; sub?: string }) {
  return (
    <div className="keyrow">
      <span className="avatar" style={{ background: color }}>
        {initial}
      </span>
      <span>
        {text}
        {sub && <span className="faint small"> · {sub}</span>}
      </span>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="stack-lg">
      <section className="hero">
        <div className="stack">
          <span className="eyebrow">For grant programs, accelerators and early funds</span>
          <h1>Know who you&apos;re funding, from day zero.</h1>
          <p className="lead">
            A 2-of-2 treasury means nothing if one person holds both keys. vestige proves a team&apos;s founders are <strong>two distinct real humans</strong>,
            binds them to <strong>signed terms</strong>, and gives them a <strong>USDT treasury neither can drain alone</strong> — checkable by anyone
            from one ENS name. Nobody touches gas or a seed phrase.
          </p>
          <div className="row">
            <Link className="btn" href="/founder" data-testid="cta-founder">
              Form a venture
            </Link>
            <Link className="btn btn-secondary" href="/funder" data-testid="cta-funder">
              I fund teams
            </Link>
          </div>
        </div>

        <div className="compare" aria-label="Two keys versus two humans">
          <div className="compare-col bad">
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              An ordinary 2-of-2
            </div>
            <KeyRow color="#8b8f99" initial="?" text="Key 0x3f…a1" />
            <KeyRow color="#8b8f99" initial="?" text="Key 0x9c…07" />
            <p className="small muted" style={{ marginTop: 10 }}>
              Could be one person with two wallets. Nobody checks.
            </p>
          </div>
          <div className="compare-col good">
            <div className="eyebrow" style={{ marginBottom: 8, color: "var(--chain)" }}>
              A vestige venture
            </div>
            <KeyRow color="var(--human)" initial="A" text="Human A" sub="World ID" />
            <KeyRow color="var(--signed)" initial="B" text="Human B" sub="World ID" />
            <p className="small muted" style={{ marginTop: 10 }}>
              Two proven-distinct people. The Safe Guard rejects any key swap to someone unverified.
            </p>
          </div>
        </div>
      </section>

      <section className="grid-3">
        <Link href="/founder" className="card entry" data-testid="entry-founder">
          <span className="eyebrow">Founders</span>
          <h3>Form your team in ten minutes</h3>
          <p>Claim a name like northstar.vestige.eth, invite your co-founder, prove you&apos;re both human, sign your founding terms, get a shared treasury.</p>
          <span className="go">Start a venture →</span>
        </Link>
        <Link href="/funder" className="card entry" data-testid="entry-funder">
          <span className="eyebrow">Funders</span>
          <h3>Fund teams you can verify</h3>
          <p>See which teams have two verified humans, signed terms and an active treasury. Fund it by signing one message — no gas token needed.</p>
          <span className="go">Open the funder view →</span>
        </Link>
        <div className="card entry" data-testid="entry-verify">
          <span className="eyebrow">Anyone</span>
          <h3>Verify a venture</h3>
          <p>Enter a venture&apos;s ENS name. We resolve it on Ethereum, then read its treasury straight from Whitechain — not from our database.</p>
          <EnsLookupForm compact />
        </div>
      </section>

      <section className="card card-pad stack-sm">
        <span className="eyebrow">How each claim is labelled</span>
        <div className="grid-2 small">
          <p>
            <span className="badge badge-HUMAN_VERIFIED">HUMAN_VERIFIED</span> a World ID proof of unique humanity, checked on our server.
          </p>
          <p>
            <span className="badge badge-SIGNED">SIGNED</span> an EIP-712 signature from the founder&apos;s own wallet.
          </p>
          <p>
            <span className="badge badge-CHAIN_VERIFIED">CHAIN_VERIFIED</span> a transaction receipt on Sepolia or Whitechain, read independently.
          </p>
          <p>
            <span className="badge badge-SELF_REPORTED">SELF_REPORTED</span> entered by the team; not independently checked.
          </p>
        </div>
      </section>
    </div>
  );
}

import { EnsLookupForm } from "@/components/EnsLookupForm";

export default function VerifyLookupPage() {
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <div className="stack">
        <span className="eyebrow">Public verifier</span>
        <h1>Verify a venture by its name</h1>
        <p className="lead">
          No account needed. We resolve the name on Ethereum Sepolia, follow its record to the treasury on Whitechain, and read the owners, the
          signing rule, the Guard and the USDT balance straight from the chain — not from vestige&apos;s database.
        </p>
      </div>
      <div className="card card-pad">
        <EnsLookupForm />
      </div>
    </div>
  );
}

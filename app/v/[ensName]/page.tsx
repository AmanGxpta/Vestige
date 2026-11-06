import { PublicEvidenceView } from "@/src/modules/public-view/PublicEvidenceView";

export default async function PublicEvidencePage({
  params,
  searchParams,
}: {
  params: Promise<{ ensName: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { ensName } = await params;
  const { source } = await searchParams;
  return <PublicEvidenceView ensName={decodeURIComponent(ensName).toLowerCase()} requestedSource={source} />;
}

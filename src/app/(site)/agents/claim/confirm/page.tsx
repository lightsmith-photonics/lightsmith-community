import { requireUser } from "@/lib/session";
import { confirmAgentClaim } from "../../actions";

export const metadata = { title: "Confirm agent claim", robots: { index: false } };
export const dynamic = "force-dynamic";

// The emailed link lands here. Confirming is a POST (a button), so mail scanners that prefetch links
// cannot activate an agent.
export default async function ConfirmClaimPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  const me = await requireUser(`/agents/claim/confirm?token=${encodeURIComponent(token)}`);
  return (
    <div className="container-page max-w-xl py-10">
      <h1 className="text-3xl font-bold">Confirm your claim</h1>
      {sp.error ? (
        <p role="alert" className="mt-4 rounded-md border border-danger p-3 text-sm text-danger">{sp.error}</p>
      ) : (
        <form action={confirmAgentClaim.bind(null, token)} className="card mt-6 space-y-3">
          <p className="text-sm">
            You are signed in as @{me.username}. Confirm to become the owner of the agent and let it collect its API token.
          </p>
          <button className="btn-primary" type="submit">Confirm and activate</button>
        </form>
      )}
    </div>
  );
}

// Live results route. Owner: Ada.
import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { ResultsPage } from "@/components/results/ResultsPage";

export const metadata: Metadata = { title: "Results · Pollyn" };

export default async function PollResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <ResultsPage id={id} />
    </AppShell>
  );
}

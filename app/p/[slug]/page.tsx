// Voter flow route. Owner: Ada.
import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { VoterApp } from "@/components/vote/VoterApp";

export const metadata: Metadata = { title: "Vote · Pollyn" };

export default async function VotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <AppShell wide={false}>
      <VoterApp slug={slug} />
    </AppShell>
  );
}

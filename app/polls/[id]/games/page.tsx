"use client";
// /polls/[id]/games: randomiser arcade (owner only). Owner: Woz.
import { useParams } from "next/navigation";
import { GamesArcade } from "@/components/games/GamesArcade";

export default function GamesPage() {
  const { id } = useParams<{ id: string }>();
  return <GamesArcade pollId={id} />;
}

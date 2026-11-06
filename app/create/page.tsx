import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateBuilder } from "@/components/builder/Builder";

export const metadata: Metadata = { title: "New poll · Pollyn" };

export default function CreatePage() {
  return <Suspense fallback={null}><CreateBuilder /></Suspense>;
}

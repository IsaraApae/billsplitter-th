import type { Metadata } from "next";
import { FriendsClient } from "@/components/clientOnly";

export const metadata: Metadata = { title: "Friends" };

export default function FriendsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pt-5 pb-16">
      <FriendsClient />
    </main>
  );
}

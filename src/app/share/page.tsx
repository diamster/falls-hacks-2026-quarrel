import { ShareInvite } from "@/components/share-invite";

export default async function SharePage({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { room } = await searchParams;
  const candidate = typeof room === "string" ? room.trim().toUpperCase() : "";
  const code = /^[A-HJ-NP-Z2-9]{6}$/.test(candidate) ? candidate : null;
  return <ShareInvite code={code} issue={code ? null : room === undefined || room === "" ? "missing" : "invalid"}/>;
}

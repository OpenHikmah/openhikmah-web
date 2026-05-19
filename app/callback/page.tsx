import { CallbackClient } from "./CallbackClient";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string }>;
}) {
  const { code, error } = await searchParams;
  return <CallbackClient code={code} error={error} />;
}

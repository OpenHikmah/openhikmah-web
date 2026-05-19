import { CallbackClient } from "./CallbackClient";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string }>;
}) {
  const { code, state, error } = await searchParams;
  return <CallbackClient code={code} state={state} error={error} />;
}

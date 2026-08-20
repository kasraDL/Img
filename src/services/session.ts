import type { SessionState } from "../types";

const TTL_SECONDS = 60 * 60 * 24 * 3; // 3 days of inactivity clears the in-progress flow

export async function getSession(kv: KVNamespace, chatId: number): Promise<SessionState> {
  const raw = await kv.get(`session:${chatId}`);
  if (!raw) return { step: "idle" };
  return JSON.parse(raw) as SessionState;
}

export async function setSession(
  kv: KVNamespace,
  chatId: number,
  state: SessionState
): Promise<void> {
  await kv.put(`session:${chatId}`, JSON.stringify(state), { expirationTtl: TTL_SECONDS });
}

/** Keeps every open tab in step: signing out in one signs out all of them. */
export type AuthMessage = { type: 'signed-in' } | { type: 'signed-out' };

const channel: BroadcastChannel | null =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('planpilot-auth');

export function broadcast(message: AuthMessage) {
  channel?.postMessage(message);
}

export function onBroadcast(handler: (message: AuthMessage) => void): () => void {
  if (!channel) return () => undefined;
  const listener = (event: MessageEvent<AuthMessage>) => handler(event.data);
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}

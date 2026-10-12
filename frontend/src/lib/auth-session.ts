/** Session-expiry bridge between the API client and AppShell (no tokens in localStorage). */

export const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please log in again.";

type SessionExpiredListener = (message: string) => void;

const listeners = new Set<SessionExpiredListener>();

export function onSessionExpired(listener: SessionExpiredListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifySessionExpired(
  message: string = SESSION_EXPIRED_MESSAGE,
) {
  for (const listener of listeners) {
    listener(message);
  }
}

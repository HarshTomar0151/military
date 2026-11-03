import type { GameKind } from '../../shared/protocol';

/** Room invite pulled from the page URL (?room=ABCD&g=cricket) when a friend opens a shared link. */
export const invite: { room: string; game: GameKind } = { room: '', game: 'shooter' };

export function readInviteFromUrl(): void {
  try {
    const q = new URLSearchParams(window.location.search);
    const room = (q.get('room') ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (room) {
      invite.room = room;
      invite.game = q.get('g') === 'cricket' ? 'cricket' : 'shooter';
      // keep the address bar clean so a refresh doesn't re-join a finished room
      window.history.replaceState(null, '', window.location.pathname);
    }
  } catch {
    /* ignore malformed URLs */
  }
}

export function inviteUrl(id: string, game: GameKind): string {
  const u = new URL(window.location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('room', id);
  u.searchParams.set('g', game);
  return u.toString();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older WebViews / insecure origins: fall back to a hidden textarea
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-1000px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Opens the phone's share sheet (WhatsApp etc.) or copies the invite text + link. */
export async function shareRoom(id: string, game: GameKind): Promise<'shared' | 'copied' | 'failed'> {
  const url = inviteUrl(id, game);
  const text = `Join my ${game === 'cricket' ? 'Cricket' : 'JETFRONT'} match! Room code: ${id}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'JETFRONT', text, url });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'failed';
    }
  }
  return (await copyText(`${text}\n${url}`)) ? 'copied' : 'failed';
}

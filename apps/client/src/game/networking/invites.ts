import { codePattern } from '@breakpoint/shared/network';

export function readInviteCode(href: string): string {
  try {
    const code =
      new URL(href).searchParams.get('room')?.trim().toUpperCase() ?? '';
    return codePattern.test(code) ? code : '';
  } catch {
    return '';
  }
}

export function roomInviteUrl(href: string, code: string): string {
  if (!codePattern.test(code))
    throw new Error('Cannot share an invalid room code.');
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.href;
}

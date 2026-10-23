import { Preferences } from '@capacitor/preferences';

const KEY = 'abs_ftp_browser_state';

export interface FtpBrowserState {
  tab: 'local' | 'remote';
  localPath: string;
  remotePath: string;
}

type StateMap = Record<string, FtpBrowserState>;

export async function loadFtpState(projectId: string): Promise<FtpBrowserState | null> {
  const raw = await Preferences.get({ key: KEY });
  if (!raw.value) return null;
  try {
    const map = JSON.parse(raw.value) as StateMap;
    return map[projectId] || null;
  } catch {
    return null;
  }
}

export async function saveFtpState(projectId: string, state: FtpBrowserState): Promise<void> {
  const raw = await Preferences.get({ key: KEY });
  let map: StateMap = {};
  if (raw.value) {
    try {
      map = JSON.parse(raw.value) as StateMap;
    } catch {
      map = {};
    }
  }
  map[projectId] = state;
  await Preferences.set({ key: KEY, value: JSON.stringify(map) });
}

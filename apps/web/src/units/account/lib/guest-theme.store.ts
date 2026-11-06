export type ThemeMode='light'|'dark'|'auto';
export const GUEST_THEME_KEY='agentstack.guest-theme';
export function readGuestTheme():ThemeMode {
 try {const value=globalThis.localStorage?.getItem(GUEST_THEME_KEY);if(value==='light'||value==='dark')return value;}catch{/* Storage may be unavailable. */}
 return 'auto';
}
export function persistGuestTheme(theme:ThemeMode){try{globalThis.localStorage?.setItem(GUEST_THEME_KEY,theme);}catch{/* The active session can still change themes. */}}

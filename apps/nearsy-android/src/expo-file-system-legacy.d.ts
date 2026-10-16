/**
 * Ambient types for Expo FS legacy entry + Metro bare shim.
 * expo-file-system@19 ships legacy.ts without package.json "exports".
 */
declare module 'expo-file-system/legacy' {
  export const cacheDirectory: string | null;
  export function downloadAsync(
    uri: string,
    fileUri: string,
    options?: { headers?: Record<string, string> },
  ): Promise<{
    uri: string;
    status: number;
    headers: Record<string, string>;
  }>;
  export function getInfoAsync(
    fileUri: string,
  ): Promise<{ exists: boolean; size?: number; uri?: string }>;
  export function deleteAsync(
    fileUri: string,
    options?: { idempotent?: boolean },
  ): Promise<void>;
}

declare module 'expo-file-system/legacy.ts' {
  export {
    cacheDirectory,
    downloadAsync,
    getInfoAsync,
    deleteAsync,
  } from 'expo-file-system/legacy';
}

declare module 'nearsy-expo-fs-legacy' {
  export {
    cacheDirectory,
    downloadAsync,
    getInfoAsync,
    deleteAsync,
  } from 'expo-file-system/legacy';
}

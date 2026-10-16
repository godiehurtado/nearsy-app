/** Metro bare specifier — implemented by apps/nearsy-android/src/expoLegacyFileSystem.ts */
declare module 'nearsy-expo-fs-legacy' {
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

export async function copyText(text: string): Promise<boolean> {
  try {
    if (!globalThis.navigator?.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

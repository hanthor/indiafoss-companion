export { downloadTextFile } from '$lib/calendar';

/** Share a text file through the platform share sheet; false when unsupported. */
export async function shareTextFile(
  filename: string,
  content: string,
  mime: string,
): Promise<boolean> {
  if (typeof navigator.share !== 'function' || typeof File === 'undefined') return false;
  const file = new File([content], filename, { type: mime });
  if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
    return false;
  }
  await navigator.share({ files: [file], title: filename });
  return true;
}

/** Share plain text (a link or id) through the platform share sheet. */
export async function shareText(title: string, text: string): Promise<boolean> {
  if (typeof navigator.share !== 'function') return false;
  await navigator.share({ title, text });
  return true;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

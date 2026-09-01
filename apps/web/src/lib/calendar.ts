/** Browser helpers for local calendar export/share. */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function shareCalendarFile(filename: string, content: string): Promise<boolean> {
  if (typeof navigator.share !== 'function' || typeof File === 'undefined') return false;
  const file = new File([content], filename, { type: 'text/calendar' });
  if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] }))
    return false;
  await navigator.share({ files: [file], title: filename });
  return true;
}

import { parseScannedPayload } from '@indiafoss/model';

/** Decode locally. Never follow ticket URLs or send the document to a service. */
export async function readTicketFile(file: File): Promise<string[]> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a ticket smaller than 20 MB.');
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();
  const tickets = new Set<string>();
  const collect = (raw: string) => {
    const parsed = parseScannedPayload(raw);
    if (parsed.kind === 'ticket') tickets.add(parsed.ticketRef);
  };
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 10)
        throw new Error(
          'Choose a PDF with at most 10 pages, or upload a screenshot of your ticket.',
        );
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const original = page.getViewport({ scale: 1 });
        const scale = Math.min(3, 2400 / Math.max(original.width, original.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        try {
          await page.render({ canvas, viewport }).promise;
          try {
            collect(reader.decodeFromCanvas(canvas).getText());
          } catch {
            /* No readable code on this page. */
          }
        } finally {
          canvas.width = canvas.height = 0;
          page.cleanup();
        }
      }
    } finally {
      await task.destroy();
    }
  } else if (/^image\/(png|jpeg|webp)$/.test(file.type)) {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(bitmap.width * scale);
      canvas.height = Math.ceil(bitmap.height * scale);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      try {
        collect(reader.decodeFromCanvas(canvas).getText());
      } catch {
        /* Show the actionable no-code message below. */
      } finally {
        canvas.width = canvas.height = 0;
      }
    } finally {
      bitmap.close();
    }
  } else {
    throw new Error('Choose a PDF, PNG, JPEG or WebP ticket.');
  }
  if (!tickets.size)
    throw new Error(
      'No readable IndiaFOSS ticket code found. Try a clear screenshot cropped around the QR code, or paste your ticket link.',
    );
  return [...tickets];
}

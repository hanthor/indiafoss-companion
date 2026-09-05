import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyText, shareText, shareTextFile } from './share';

describe('shareText', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('returns false when navigator.share is unsupported', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });

    const result = await shareText('Title', 'Text content');
    expect(result).toBe(false);
  });

  it('invokes navigator.share and returns true when supported', async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { share: mockShare },
      writable: true,
      configurable: true,
    });

    const result = await shareText('Title', 'Text content');
    expect(result).toBe(true);
    expect(mockShare).toHaveBeenCalledWith({ title: 'Title', text: 'Text content' });
  });
});

describe('shareTextFile', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('returns false when navigator.share is missing', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });

    const result = await shareTextFile('file.txt', 'hello', 'text/plain');
    expect(result).toBe(false);
  });

  it('returns false when canShare returns false', async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    const mockCanShare = vi.fn().mockReturnValue(false);
    Object.defineProperty(globalThis, 'navigator', {
      value: { share: mockShare, canShare: mockCanShare },
      writable: true,
      configurable: true,
    });

    const result = await shareTextFile('file.txt', 'hello', 'text/plain');
    expect(result).toBe(false);
    expect(mockCanShare).toHaveBeenCalled();
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('shares file when supported and canShare returns true', async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    const mockCanShare = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis, 'navigator', {
      value: { share: mockShare, canShare: mockCanShare },
      writable: true,
      configurable: true,
    });

    const result = await shareTextFile('file.txt', 'hello', 'text/plain');
    expect(result).toBe(true);
    expect(mockShare).toHaveBeenCalledWith({ files: [expect.any(File)], title: 'file.txt' });
  });
});

describe('copyText', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('copies text to clipboard and returns true', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: mockWriteText } },
      writable: true,
      configurable: true,
    });

    const result = await copyText('copied text');
    expect(result).toBe(true);
    expect(mockWriteText).toHaveBeenCalledWith('copied text');
  });

  it('returns false when clipboard write fails', async () => {
    const mockWriteText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: mockWriteText } },
      writable: true,
      configurable: true,
    });

    const result = await copyText('copied text');
    expect(result).toBe(false);
  });
});

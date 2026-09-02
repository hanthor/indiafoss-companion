import { describe, expect, it } from 'vitest';
import {
  companionChatLink,
  localpart,
  matrixToUrl,
  matrixUri,
  parseMatrixTarget,
} from './links.js';

describe('parseMatrixTarget', () => {
  it('accepts raw ids', () => {
    expect(parseMatrixTarget('@alice:example.org')).toEqual({
      kind: 'user',
      id: '@alice:example.org',
    });
    expect(parseMatrixTarget('#room:example.org')).toEqual({
      kind: 'alias',
      id: '#room:example.org',
    });
    expect(parseMatrixTarget('!abc:example.org')).toEqual({ kind: 'room', id: '!abc:example.org' });
  });

  it('accepts matrix.to permalinks and matrix: URIs', () => {
    expect(parseMatrixTarget('https://matrix.to/#/@alice:example.org?via=x')).toEqual({
      kind: 'user',
      id: '@alice:example.org',
    });
    expect(parseMatrixTarget('https://matrix.to/#/%23room%3Aexample.org')).toEqual({
      kind: 'alias',
      id: '#room:example.org',
    });
    expect(parseMatrixTarget('matrix:r/room:example.org?action=join')).toEqual({
      kind: 'alias',
      id: '#room:example.org',
    });
    expect(parseMatrixTarget('matrix:roomid/abc:example.org')).toEqual({
      kind: 'room',
      id: '!abc:example.org',
    });
  });

  it('accepts companion chat links and rejects junk', () => {
    expect(parseMatrixTarget('indiafoss://chat?dm=%40bob%3Ax.org')).toEqual({
      kind: 'user',
      id: '@bob:x.org',
    });
    expect(parseMatrixTarget('indiafoss://chat?join=%23r%3Ax.org')).toEqual({
      kind: 'alias',
      id: '#r:x.org',
    });
    expect(parseMatrixTarget('indiafoss://chat?dm=bob')).toBeNull();
    expect(parseMatrixTarget('')).toBeNull();
    expect(parseMatrixTarget('https://example.org')).toBeNull();
    expect(parseMatrixTarget('@' + 'a'.repeat(600) + ':x')).toBeNull();
  });
});

describe('link builders', () => {
  it('produce Element-compatible and native links', () => {
    expect(matrixToUrl('#room:example.org')).toBe('https://matrix.to/#/%23room%3Aexample.org');
    expect(matrixUri({ kind: 'user', id: '@a:b' })).toBe('matrix:u/a%3Ab?action=chat');
    expect(matrixUri({ kind: 'alias', id: '#r:b' })).toBe('matrix:r/r%3Ab?action=join');
    expect(companionChatLink({ kind: 'user', id: '@a:b' })).toBe('indiafoss://chat?dm=%40a%3Ab');
    expect(localpart('@alice:example.org')).toBe('alice');
    expect(localpart('nonsense')).toBe('nonsense');
  });
});

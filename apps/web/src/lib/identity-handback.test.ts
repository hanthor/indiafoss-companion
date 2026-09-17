import { describe, expect, it } from 'vitest';
import { identityHandbackPath, parseIdentityHandback } from './identity-handback';

const NODE = 'a'.repeat(64);

describe('identity hand-back from Chat', () => {
  it('reads a mesh node id, lower-cased, and a Matrix id', () => {
    expect(parseIdentityHandback(new URLSearchParams(`mesh=${NODE.toUpperCase()}`))).toEqual({
      neutrinoServerName: NODE,
    });
    expect(parseIdentityHandback(new URLSearchParams('matrix=@alice:matrix.org'))).toEqual({
      matrixId: '@alice:matrix.org',
    });
  });

  it('ignores anything that is not a node id or a Matrix id', () => {
    expect(parseIdentityHandback(new URLSearchParams('mesh=845aa456897e'))).toBeNull();
    expect(parseIdentityHandback(new URLSearchParams('matrix=alice'))).toBeNull();
    expect(parseIdentityHandback(new URLSearchParams('contact=abc'))).toBeNull();
  });

  it('round-trips through the path Chat opens', () => {
    const path = identityHandbackPath({ neutrinoServerName: NODE, matrixId: '@a:b.org' });
    expect(path).toBe(`/connect?mesh=${NODE}&matrix=%40a%3Ab.org`);
    expect(parseIdentityHandback(new URL(path, 'https://x').searchParams)).toEqual({
      neutrinoServerName: NODE,
      matrixId: '@a:b.org',
    });
  });
});

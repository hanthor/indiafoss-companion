import { expect, test, type Page } from '@playwright/test';
import { appUrl } from './app-url.js';

/**
 * The separated trust states on the contact screens (#31, #188, C-10).
 *
 * Every assertion here is about visible wording. A card signature, a badge
 * comparison, a profile match and Matrix verification are four different
 * facts, and the word "Verified" must never appear for anything but the last
 * — which nothing in the app can produce yet.
 */

const MESH = '845aa456078572639c1543694de69e0a03fb883bd9c1dab1a2f6df811b75897e';
const OTHER_MESH = 'b'.repeat(64);
const FP = '8f2a9c1d4e6b7a3f'.repeat(4);

/** A card from another app: no key, so unsigned, but claiming a Matrix id and a mesh id. */
function cardClaiming(name: string, matrixId: string, mesh: string): string {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    `X-INDIAFOSS-MATRIX:${matrixId}`,
    `X-INDIAFOSS-MESH:${mesh}`,
    'END:VCARD',
  ].join('\r\n');
}

/**
 * Stand in for the peer's homeserver. `published` is what its public profile
 * says under `in.indiafoss.mesh`; `null` means no such field; 'down' means
 * the server cannot be reached.
 */
async function homeserver(page: Page, published: string | null | 'down'): Promise<void> {
  // The app reads the profile cross-origin, so the stand-in must answer CORS.
  const headers = { 'Access-Control-Allow-Origin': '*' };
  if (published === 'down') {
    // Discovery falls back to the bare origin, so the whole host must be dark.
    await page.route('https://example.org/**', (route) => route.abort());
    await page.route('https://cs.example.org/**', (route) => route.abort());
    return;
  }
  await page.route('https://example.org/.well-known/matrix/client', (route) =>
    published === 'down'
      ? route.abort()
      : route.fulfill({
          headers,
          json: { 'm.homeserver': { base_url: 'https://cs.example.org' } },
        }),
  );
  await page.route('https://cs.example.org/_matrix/client/v3/profile/**', (route) =>
    published === 'down'
      ? route.abort()
      : route.fulfill({
          headers,
          json: {
            displayname: 'Asha',
            ...(published === null ? {} : { 'in.indiafoss.mesh': published }),
          },
        }),
  );
}

/**
 * Put a contact straight into the app's IndexedDB, the way an earlier build
 * or an earlier scan would have left it. Signed cards need a key pair to
 * make in the browser, so the stored shape is seeded rather than scanned.
 */
async function seedContact(page: Page, record: Record<string, unknown>): Promise<void> {
  await page.goto(appUrl('/connect?setup=done'));
  await expect(page.getByRole('heading', { name: 'Your contact card', exact: true })).toBeVisible();
  await page.evaluate(async (row) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('indiafoss-companion');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('contacts', 'readwrite');
      tx.objectStore('contacts').put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, record);
  await page.reload();
}

const base = {
  id: 'seeded',
  vcard: '',
  socials: {},
  verified: false,
  savedAt: '2026-09-19T10:00:00.000Z',
  lastMetAt: '2026-09-19T10:00:00.000Z',
  metCount: 1,
};

async function openSeeded(page: Page, name: string) {
  const row = page.getByRole('button', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await row.click();
  return row;
}

test('the scan preview names three separate steps and promises no route it cannot see', async ({
  page,
}) => {
  await page.goto(
    appUrl(
      `/scan?payload=${encodeURIComponent(cardClaiming('Asha Rao', '@asha:example.org', MESH))}`,
    ),
  );
  await expect(page.getByRole('heading', { name: 'Confirm before importing' })).toBeVisible();
  await expect(page.getByText('does not prove who is showing it')).toBeVisible();
  await expect(page.getByText('No badge to compare')).toBeVisible();
  await expect(page.getByText('Account link claimed, not checked yet')).toBeVisible();
  await expect(page.getByText('Not verified in Chat')).toBeVisible();
  // Opening a chat is a handoff the page cannot vouch for.
  const routes = page.locator('.routes');
  await expect(routes.getByRole('link', { name: 'Message on mesh' })).toBeVisible();
  await expect(routes.getByRole('link', { name: 'Open in a Matrix app' })).toBeVisible();
  await expect(routes).toContainText('This app cannot tell whether it is.');
  await expect(page.getByRole('link', { name: 'Open in Element' })).toHaveCount(0);
  await expect(page.locator('.preview')).not.toContainText(/\bVerified\b/);
  await page.getByRole('button', { name: 'Save contact', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saving is not verification');
});

test('a card with no address offers no chat route rather than a dead button', async ({ page }) => {
  const plain = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Riya Verma', 'END:VCARD'].join('\r\n');
  await page.goto(appUrl(`/scan?payload=${encodeURIComponent(plain)}`));
  await expect(page.getByText('No known chat route on this card.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Message on mesh' })).toHaveCount(0);
});

test('a profile that agrees with the card reads "Profile matches", never "Verified"', async ({
  page,
}) => {
  await homeserver(page, MESH.toUpperCase());
  await page.goto(
    appUrl(
      `/scan?payload=${encodeURIComponent(cardClaiming('Asha Rao', '@asha:example.org', MESH))}`,
    ),
  );
  await page.getByRole('button', { name: 'Save contact', exact: true }).click();
  await page.getByRole('link', { name: 'View contact', exact: true }).click();
  const row = page.getByRole('button', { name: /Asha Rao/ });
  await expect(row).toContainText('PROFILE MATCHES');
  await expect(row).toContainText('UNSIGNED CARD');
  const detail = page.locator('.persondetail');
  await expect(detail).toContainText('Profile matches');
  await expect(detail).toContainText("the homeserver's word, not proof");
  await expect(detail).toContainText('Not verified in Chat');
  await expect(detail).toContainText('No badge to compare');
  await expect(page.locator('.people')).not.toContainText(/\bVerified\b/);
});

test('a profile naming a different mesh identity reads "Does not match"', async ({ page }) => {
  await homeserver(page, OTHER_MESH);
  await page.goto(
    appUrl(
      `/scan?payload=${encodeURIComponent(cardClaiming('Asha Rao', '@asha:example.org', MESH))}`,
    ),
  );
  await page.getByRole('button', { name: 'Save contact', exact: true }).click();
  await page.getByRole('link', { name: 'View contact', exact: true }).click();
  await expect(page.getByRole('button', { name: /Asha Rao/ })).toContainText('DOES NOT MATCH');
  await expect(page.locator('.persondetail')).toContainText(
    'names a different mesh identity than this card',
  );
});

test('a profile with no mesh id stays a claim', async ({ page }) => {
  await homeserver(page, null);
  await page.goto(
    appUrl(
      `/scan?payload=${encodeURIComponent(cardClaiming('Asha Rao', '@asha:example.org', MESH))}`,
    ),
  );
  await page.getByRole('button', { name: 'Save contact', exact: true }).click();
  await page.getByRole('link', { name: 'View contact', exact: true }).click();
  await expect(page.getByRole('button', { name: /Asha Rao/ })).toContainText(
    'ACCOUNT LINK CLAIMED, PROFILE NAMES NO MESH ID',
  );
});

test('an unreachable homeserver leaves the claim unchecked', async ({ page }) => {
  await homeserver(page, 'down');
  await page.goto(
    appUrl(
      `/scan?payload=${encodeURIComponent(cardClaiming('Dev Nair', '@dev:example.org', MESH))}`,
    ),
  );
  await page.getByRole('button', { name: 'Save contact', exact: true }).click();
  await page.getByRole('link', { name: 'View contact', exact: true }).click();
  await expect(page.getByRole('button', { name: /Dev Nair/ })).toContainText(
    'ACCOUNT LINK CLAIMED, NOT CHECKED YET',
  );
});

test('a signed card shows the card key as a fact about the key, with the badge unconfirmed', async ({
  page,
}) => {
  await seedContact(page, {
    ...base,
    fullName: 'Signed Person',
    signature: 'valid',
    fingerprint: FP,
    publicKey: 'ed25519:AAAA',
  });
  const row = await openSeeded(page, 'Signed Person');
  await expect(row).toContainText('CARD SIGNED · BADGE');
  const detail = page.locator('.persondetail');
  await expect(detail).toContainText('It does not say who was holding the phone.');
  await expect(detail).toContainText('Badge not compared in person');
  await expect(detail).toContainText('Not verified in Chat');
  await expect(detail).toContainText('No known chat route on this card.');
  await expect(detail.getByRole('link', { name: 'Compare badges' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Badges matched in person' })).toBeVisible();
});

test('"Badges matched in person" is the attendee’s own explicit action, and is undoable', async ({
  page,
}) => {
  await seedContact(page, {
    ...base,
    fullName: 'Signed Person',
    signature: 'valid',
    fingerprint: FP,
    publicKey: 'ed25519:AAAA',
    matrixId: '@signed:example.org',
  });
  const row = await openSeeded(page, 'Signed Person');
  await expect(row).not.toContainText('BADGE COMPARED IN PERSON');
  const detail = page.locator('.persondetail');
  await detail.getByRole('button', { name: 'Badges matched in person' }).click();
  await expect(row).toContainText('BADGE COMPARED IN PERSON');
  await expect(detail).toContainText('your own statement');
  // Confirming a badge changes nothing about the accounts or the chat.
  await expect(detail).toContainText('Not verified in Chat');
  await expect(page.locator('.people')).not.toContainText(/\bVerified\b/);
  // It survives a reload, and can be taken back.
  await page.reload();
  await openSeeded(page, 'Signed Person');
  await expect(page.locator('.persondetail')).toContainText('Badge compared in person');
  await page.getByRole('button', { name: 'Undo badge comparison' }).click();
  await expect(page.locator('.persondetail')).toContainText('Badge not compared in person');
});

test('the compare screen opens on the requested contact and records the comparison', async ({
  page,
}) => {
  await seedContact(page, {
    ...base,
    fullName: 'Signed Person',
    signature: 'valid',
    fingerprint: FP,
    publicKey: 'ed25519:AAAA',
  });
  await page.goto(appUrl('/connect/compare?contact=seeded'));
  await expect(page.getByLabel('Contact to compare')).toHaveValue('seeded');
  await expect(page.getByText('Badge not compared in person')).toBeVisible();
  await expect(page.getByText('nothing more: not their name, not their accounts')).toBeVisible();
  await page.getByRole('button', { name: 'Badges matched in person' }).click();
  await expect(page.getByRole('status')).toContainText('does not verify their accounts');
  await expect(page.getByText('Badge compared in person', { exact: true })).toBeVisible();
});

test('a confirmation is bound to the key it was made for', async ({ page }) => {
  await seedContact(page, {
    ...base,
    fullName: 'Rekeyed Person',
    signature: 'valid',
    fingerprint: '1'.repeat(64),
    keyChanged: true,
    previousFingerprint: FP,
    inPersonConfirmed: { fingerprint: FP, at: '2026-09-19T11:00:00.000Z' },
  });
  const row = await openSeeded(page, 'Rekeyed Person');
  await expect(row).toContainText('KEY CHANGED SINCE AN EARLIER CARD');
  await expect(row).toContainText('BADGE COMPARED IN PERSON FOR AN EARLIER KEY');
  await expect(page.locator('.persondetail')).toContainText(
    'Compare badges in person before trusting either.',
  );
});

test('a profile match saved by an older build as "verified" reads back as a profile match', async ({
  page,
}) => {
  await seedContact(page, {
    ...base,
    fullName: 'Legacy Person',
    matrixId: '@legacy:example.org',
    neutrinoServerName: MESH,
    // Stored by a build before the trust split. Fresh, so it is not re-checked.
    meshLink: { state: 'verified', checkedAt: Date.now() },
  });
  const row = await openSeeded(page, 'Legacy Person');
  await expect(row).toContainText('PROFILE MATCHES');
  await expect(row).not.toContainText(/\bVERIFIED\b/);
  await expect(page.locator('.persondetail')).toContainText('Not verified in Chat');
});

test('a self-signed card naming somebody else’s account earns nothing above a claim', async ({
  page,
}) => {
  // The adversarial acceptance case from C-10: a valid signature, somebody
  // else's MXID, and a stored trust value that a file might try to smuggle in.
  await seedContact(page, {
    ...base,
    fullName: 'Mallory as Alice',
    signature: 'valid',
    fingerprint: '2'.repeat(64),
    matrixId: '@alice:matrix.org',
    neutrinoServerName: MESH,
    accountTrust: 'verified',
    meshLink: { state: 'profile-matched', checkedAt: Date.now() },
  });
  const row = await openSeeded(page, 'Mallory as Alice');
  await expect(row).toContainText('CARD SIGNED · BADGE');
  await expect(row).toContainText('PROFILE MATCHES');
  await expect(row).not.toContainText(/\bVERIFIED\b/);
  const detail = page.locator('.persondetail');
  await expect(detail).toContainText('Not verified in Chat');
  await expect(detail).toContainText('not proof the account is theirs');
  await expect(detail.getByRole('link', { name: 'Open in a Matrix app' })).toBeVisible();
  await expect(detail).toContainText('This app cannot tell whether one is');
});

test('a card in an identity format this build cannot read is kept, shown neutrally and never routed (#160)', async ({
  page,
}) => {
  // A card from a build that knows identity version 2: the fields are kept
  // as they arrived, the preview says so in neutral words, and no chat route
  // is minted from a value this build cannot vouch for.
  const future = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Asha Rao',
    'X-INDIAFOSS-MATRIX:@asha:example.org',
    `X-INDIAFOSS-MESH:${MESH}`,
    'X-INDIAFOSS-IDENTITY-VERSION:2',
    'END:VCARD',
  ].join('\r\n');
  await page.goto(appUrl(`/scan?payload=${encodeURIComponent(future)}`));
  await expect(page.getByRole('heading', { name: 'Confirm before importing' })).toBeVisible();
  await expect(page.getByTestId('identity-retained')).toContainText("can't read yet");
  await expect(page.getByText("Identity format this app can't read yet")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Message on mesh' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open in a Matrix app' })).toHaveCount(0);
  await expect(page.locator('.preview')).not.toContainText('Does not match');
  await expect(page.locator('.preview')).not.toContainText(/\bVerified\b/);
  await page.getByRole('button', { name: 'Save contact', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved Asha Rao');
  await page.getByRole('link', { name: 'View contact', exact: true }).click();
  await expect(page.getByRole('button', { name: /Asha Rao/ })).toContainText('UNSIGNED CARD');
  const detail = page.locator('.persondetail');
  await expect(detail).toContainText("Identity format this app can't read yet");
  await expect(detail).not.toContainText('Message on mesh');
  await expect(detail).not.toContainText(/\bVerified\b/);
});

/**
 * The signed binding (#188, docs/identity-binding.md). A card carrying one
 * gets its own line; a valid check lifts the account line to a binding
 * state and no further. Bindings are seeded as stored records: no surface
 * writes one yet, and the check is this device's own conclusion.
 */
const SIGNED_BINDING = {
  domain: 'in.indiafoss.binding/v1',
  statement: {
    v: 1,
    id: 'b-1',
    meshNodeId: MESH,
    matrixUserId: '@asha:example.org',
    cardKeyId: 'ed25519:AAAA',
    matrixKeyId: 'ed25519:80oru7/um4vAMFly8LhK7QTwUWENK6C6dEbTUo2bkmI',
    matrixKeyKind: 'master',
    issuedAt: '2026-09-10T09:00:00.000Z',
    expiresAt: '2026-10-10T09:00:00.000Z',
    nonce: 'AAECAwQFBgcICQoLDA0ODw',
  },
  signatures: { card: 'x', matrix: 'y' },
};

test('a valid binding reads as signed by both keys, never as "Verified"', async ({ page }) => {
  await homeserver(page, MESH);
  await seedContact(page, {
    ...base,
    fullName: 'Bound Person',
    signature: 'valid',
    fingerprint: FP,
    publicKey: 'ed25519:AAAA',
    matrixId: '@asha:example.org',
    neutrinoServerName: MESH,
    meshLink: { state: 'profile-matched', checkedAt: Date.now() },
    binding: {
      signed: SIGNED_BINDING,
      check: { state: 'valid', checkedAt: Date.now(), matrixKeyProvenance: 'server' },
    },
  });
  const row = await openSeeded(page, 'Bound Person');
  await expect(row).toContainText('BINDING SIGNED BY BOTH KEYS');
  await expect(row).toContainText('PROFILE MATCHES');
  await expect(row).not.toContainText(/\bVERIFIED\b/);
  const detail = page.locator('.persondetail');
  await expect(detail).toContainText(
    'Binding signed by both keys · Matrix key not confirmed in Chat',
  );
  await expect(detail).toContainText('confirm it in Chat before treating the accounts as one');
  await expect(detail).toContainText('Not verified in Chat');
  await expect(page.locator('.people')).not.toContainText(/\bVerified\b/);
});

test('a revoked binding is shown as revoked, above a matching profile', async ({ page }) => {
  await homeserver(page, MESH);
  await seedContact(page, {
    ...base,
    fullName: 'Withdrawn Person',
    signature: 'valid',
    fingerprint: FP,
    publicKey: 'ed25519:AAAA',
    matrixId: '@asha:example.org',
    neutrinoServerName: MESH,
    meshLink: { state: 'profile-matched', checkedAt: Date.now() },
    binding: { signed: SIGNED_BINDING, check: { state: 'revoked', checkedAt: Date.now() } },
  });
  const row = await openSeeded(page, 'Withdrawn Person');
  await expect(row).toContainText('BINDING REVOKED');
  await expect(page.locator('.persondetail')).toContainText('its owner withdrew this binding');
});

test('a binding that has not been checked, or cannot be, stays a claim', async ({ page }) => {
  await homeserver(page, 'down');
  await seedContact(page, {
    ...base,
    fullName: 'Unchecked Person',
    signature: 'valid',
    fingerprint: FP,
    publicKey: 'ed25519:AAAA',
    matrixId: '@asha:example.org',
    neutrinoServerName: MESH,
    binding: { signed: SIGNED_BINDING },
  });
  const row = await openSeeded(page, 'Unchecked Person');
  await expect(row).toContainText('BINDING NOT CHECKED YET');
  await expect(row).toContainText('ACCOUNT LINK CLAIMED, NOT CHECKED YET');
  await expect(row).not.toContainText(/\bVERIFIED\b/);
});

import { describe, expect, it } from 'vitest';
import { contactDeepLinks, messengerHandle, normalizePhone } from './contact.js';

describe('contactDeepLinks', () => {
  it('builds public deep links for phone, email, Matrix and messengers', () => {
    const links = contactDeepLinks({
      phone: '+91 98765 43210',
      email: 'ada@example.org',
      matrixId: '@ada:matrix.org',
      website: 'https://ada.example',
      socials: {
        telegram: '@ada_l',
        whatsapp: '+91-98765-43210',
        signal: '+919876543210',
        github: 'https://github.com/ada',
      },
    });
    expect(links.map((l) => [l.kind, l.href])).toEqual([
      ['phone', 'tel:+919876543210'],
      ['sms', 'sms:+919876543210'],
      ['email', 'mailto:ada@example.org'],
      ['matrix', 'https://matrix.to/#/%40ada%3Amatrix.org'],
      ['telegram', 'https://t.me/ada_l'],
      ['whatsapp', 'https://wa.me/919876543210'],
      ['signal', 'https://signal.me/#p/+919876543210'],
      ['website', 'https://ada.example'],
      ['github', 'https://github.com/ada'],
    ]);
  });

  it('falls back to the phone number for WhatsApp, accepts Signal usernames, skips junk', () => {
    const links = contactDeepLinks({
      phone: '9876543210',
      socials: { signal: 'ada.42', telegram: 'https://t.me/ada', x: 'javascript:alert(1)' },
    });
    expect(links.map((l) => [l.kind, l.href])).toEqual([
      ['phone', 'tel:9876543210'],
      ['sms', 'sms:9876543210'],
      ['telegram', 'https://t.me/ada'],
      ['whatsapp', 'https://wa.me/9876543210'],
      ['signal', 'https://signal.me/#u/ada.42'],
    ]);
    expect(contactDeepLinks({ phone: 'call me', email: 'nope', matrixId: 'ada' })).toEqual([]);
  });

  it('normalises phones and handles', () => {
    expect(normalizePhone('+1 (415) 555-0100')).toBe('+14155550100');
    expect(normalizePhone('12')).toBeNull();
    expect(messengerHandle('https://t.me/foss_united')).toBe('foss_united');
    expect(messengerHandle('@a')).toBeNull();
  });
});

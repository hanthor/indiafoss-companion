import { describe, expect, it } from 'vitest';
import { parseProposalDetail } from './parse-proposal.js';

const html = `
  <h1>Sample talk</h1>
  <fieldset>
    <legend>Session Description</legend>
    <div class="v3-html-content">
      <p>Learn how to ship FOSS.</p>
      <p>Slides: <a href="https://example.com/slides">deck</a></p>
    </div>
  </fieldset>
  <fieldset>
    <legend>Key Takeaways</legend>
    <div class="v3-html-content"><ul><li>Build openly</li><li>Share early</li></ul></div>
  </fieldset>
  <fieldset>
    <legend>References</legend>
    <div class="v3-html-content"><a href="/docs">Documentation</a></div>
  </fieldset>
  <div class="source-code-link"><a href="https://github.com/example/project">View Source Code</a></div>
`;

describe('parseProposalDetail', () => {
  it('extracts public description, takeaways and links without leaking HTML', () => {
    const detail = parseProposalDetail(html, 'proposal-1', 'https://fossunited.org/cfp/proposal-1');
    expect(detail.proposalId).toBe('proposal-1');
    expect(detail.sourceUrl).toBe('https://fossunited.org/cfp/proposal-1');
    expect(detail.description).toContain('Learn how to ship FOSS.');
    expect(detail.description).not.toContain('<p>');
    expect(detail.keyTakeaways).toEqual(['Build openly', 'Share early']);
    expect(detail.references).toEqual([
      { label: 'Documentation', url: 'https://fossunited.org/docs' },
    ]);
    expect(detail.slidesUrl).toBe('https://example.com/slides');
    expect(detail.links.some((link) => link.label === 'Source code')).toBe(true);
  });
});

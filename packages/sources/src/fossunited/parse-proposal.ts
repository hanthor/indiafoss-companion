import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { FosuProposalDetail } from './types.js';

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function labeledBlock($: cheerio.CheerioAPI, label: string): cheerio.Cheerio<Element> {
  return $('fieldset, section')
    .filter((_, element) => {
      const heading = $(element).find('legend, h2, h3, h4, h5, h6').first().text();
      return cleanText(heading) === label;
    })
    .first();
}

function absoluteUrl(value: string, sourceUrl: string): string {
  try {
    return new URL(value, sourceUrl).toString();
  } catch {
    return value;
  }
}

function linksIn(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<Element>,
  sourceUrl: string,
): { label: string; url: string }[] {
  return root
    .find('a[href]')
    .map((_, element) => {
      const url = $(element).attr('href');
      if (!url) return null;
      return { label: cleanText($(element).text()) || url, url: absoluteUrl(url, sourceUrl) };
    })
    .get()
    .filter((link): link is { label: string; url: string } => link !== null);
}

/**
 * Parse the public `/c/<event>/cfp/<submission>` page into adapter data.
 * Only structured, public fields are retained; components receive canonical
 * model data, never HTML or FOSS United selectors.
 */
export function parseProposalDetail(
  html: string,
  proposalId: string,
  sourceUrl: string,
): FosuProposalDetail {
  const $ = cheerio.load(html);
  const descriptionField = labeledBlock($, 'Session Description');
  const takeawaysField = labeledBlock($, 'Key Takeaways');
  const referencesField = labeledBlock($, 'References');
  const descriptionRoot = descriptionField.find('.v3-html-content').first();
  const paragraphs = descriptionRoot
    .find('p')
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  const description =
    (paragraphs.length > 0 ? paragraphs.join('\n\n') : cleanText(descriptionRoot.text())) ||
    undefined;
  const keyTakeaways = takeawaysField
    .find('li')
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  const references = linksIn($, referencesField, sourceUrl);
  const links = linksIn($, descriptionField, sourceUrl);
  const slidesUrl = links.find((link) =>
    /slide|presentation|deck/i.test(`${link.label} ${link.url}`),
  )?.url;
  const sourceCodeLink = $('.source-code-link a[href]').first();
  if (sourceCodeLink.length > 0) {
    const url = sourceCodeLink.attr('href');
    if (url) links.push({ label: 'Source code', url: absoluteUrl(url, sourceUrl) });
  }

  return {
    proposalId,
    sourceUrl,
    ...(description ? { description } : {}),
    keyTakeaways,
    references,
    links: links.filter(
      (link, index, all) => all.findIndex((candidate) => candidate.url === link.url) === index,
    ),
    ...(slidesUrl ? { slidesUrl } : {}),
  };
}

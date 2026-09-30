import { expect, test, type Page } from '@playwright/test';
import { appUrl } from './app-url.js';

/**
 * The Now grid (#685): one row per room on one shared time axis, scaled so a
 * 25-minute talk fills the view, opening with its left edge at now. Your
 * plan's talk is the gold card; devroom talks wear their devroom's pill and
 * colour. These pin what an attendee sees on a phone.
 */
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

const at = (time: string) =>
  appUrl(`/now?event=indiafoss-2026&setup=done&now=${encodeURIComponent(time)}`);
/** Mid-morning on day one, when every room is busy. */
const BUSY = at('2026-09-26T11:30:00+05:30');

type Box = { left: number; right: number; top: number; width: number; label: string };

async function talks(page: Page): Promise<{ view: Box; cards: Box[] }> {
  await expect(page.locator('[data-testid="now-grid"] .talk').first()).toBeVisible();
  return page.evaluate(() => {
    const box = (el: Element, label = '') => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, width: r.width, label };
    };
    const view = box(document.querySelector('[data-testid="now-grid"] .scroller')!);
    const cards = [...document.querySelectorAll('[data-testid="now-grid"] .talk')].map((el) =>
      box(el, el.getAttribute('aria-label') ?? ''),
    );
    return { view, cards };
  });
}

const minutes = (label: string): number => {
  const m = /(\d\d):(\d\d)–(\d\d):(\d\d)/.exec(label)!;
  return Number(m[3]) * 60 + Number(m[4]) - (Number(m[1]) * 60 + Number(m[2]));
};

test('a 25-minute talk fills the view and every card is its talk’s length', async ({ page }) => {
  await page.goto(BUSY);
  const { cards } = await talks(page);
  // The component scales by clientWidth, a whole number; so must this.
  const perMinute =
    (await page.locator('[data-testid="now-grid"] .scroller').evaluate((el) => el.clientWidth)) /
    25;
  for (const card of cards) {
    // Less the 4px gap that keeps back-to-back talks apart.
    expect(Math.abs(card.width - (minutes(card.label) * perMinute - 4)), card.label).toBeLessThan(
      2,
    );
  }
});

test('no card is painted over another in its row', async ({ page }) => {
  await page.goto(BUSY);
  const { cards } = await talks(page);
  const rows = new Map<number, Box[]>();
  for (const card of cards) {
    const row = rows.get(Math.round(card.top)) ?? [];
    row.push(card);
    rows.set(Math.round(card.top), row);
  }
  expect(rows.size).toBeGreaterThan(3);
  for (const row of rows.values()) {
    row.sort((a, b) => a.left - b.left);
    for (let i = 1; i < row.length; i++) {
      expect(row[i]!.left, row[i]!.label).toBeGreaterThanOrEqual(row[i - 1]!.right - 1);
    }
  }
});

test('the grid opens at now, and a running talk shows its title from the visible edge', async ({
  page,
}) => {
  await page.goto(BUSY);
  const { view } = await talks(page);
  const running = page.locator('[data-testid="now-grid"] .talk.running');
  // Hall 1 and Rooms 2 and 3; the talks starting at 11:30 are not under way yet.
  expect(await running.count()).toBeGreaterThanOrEqual(3);
  for (const card of await running.all()) {
    const box = (await card.boundingBox())!;
    // Started before now, so it runs off the left edge...
    expect(box.x).toBeLessThanOrEqual(view.left + 1);
    expect(box.x + box.width).toBeGreaterThan(view.left);
    // ...but its text starts where the attendee can read it.
    const text = (await card.locator('.inner').boundingBox())!;
    expect(text.x).toBeGreaterThanOrEqual(view.left - 1);
  }
});

test('ended talks remain on the timeline and can be reached by scrolling back', async ({
  page,
}) => {
  await page.goto(BUSY);
  const grid = page.locator('[data-testid="now-grid"]');
  const scroller = grid.locator('.scroller');

  // Use the labels rather than a fixture title: this pins the behaviour for
  // every schedule while still proving that a session ending before 11:30
  // remains in the DOM after the clock has passed it.
  const endedCount = await grid.locator('.talk').evaluateAll(
    (cards) =>
      cards.filter((card) => {
        const match = /(\d\d):(\d\d)–(\d\d):(\d\d)/.exec(card.getAttribute('aria-label') ?? '');
        if (!match) return false;
        const end = Number(match[3]) * 60 + Number(match[4]);
        return end <= 11 * 60 + 30;
      }).length,
  );
  expect(endedCount).toBeGreaterThan(0);

  expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await scroller.evaluate((el) => (el.scrollLeft = 0));
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBe(0);
  const visibleEndedCount = await grid.locator('.talk').evaluateAll((cards) => {
    const view = document
      .querySelector('[data-testid="now-grid"] .scroller')!
      .getBoundingClientRect();
    return cards.filter((card) => {
      const match = /(\d\d):(\d\d)–(\d\d):(\d\d)/.exec(card.getAttribute('aria-label') ?? '');
      if (!match) return false;
      const end = Number(match[3]) * 60 + Number(match[4]);
      const box = card.getBoundingClientRect();
      return end <= 11 * 60 + 30 && box.right > view.left && box.left < view.right;
    }).length;
  });
  expect(visibleEndedCount).toBeGreaterThan(0);
});

test('both conference days share one continuous timeline with the overnight gap', async ({
  page,
}) => {
  await page.goto(BUSY);
  await expect(page.getByRole('tab', { name: /Day [12]/ })).toHaveCount(0);

  const first = page
    .locator('[data-testid="now-grid"] .talk')
    .filter({ hasText: 'Registrations and Breakfast' });
  const last = page
    .locator('[data-testid="now-grid"] .talk')
    .filter({ hasText: 'Closing Remarks, Feedback Session' });
  await expect(first).toHaveCount(1);
  await expect(last).toHaveCount(1);

  const firstBox = (await first.boundingBox())!;
  const lastBox = (await last.boundingBox())!;
  const view = (await page.locator('[data-testid="now-grid"] .scroller').boundingBox())!;
  // More than a dozen phone-widths separate the first and last sessions: the
  // overnight hours are real space on the shared time axis, not collapsed.
  expect(lastBox.x - firstBox.x).toBeGreaterThan(view.width * 12);
});

test('the full timeline remains available after the conference', async ({ page }) => {
  await page.goto(at('2026-09-28T10:00:00+05:30'));
  await expect(page.getByText("That's a wrap")).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Full programme' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Day [12]/ })).toHaveCount(0);
  await expect(page.locator('[data-testid="now-grid"] .talk').first()).toBeVisible();
});

test('every room scrolls together, so a column is one moment across the venue', async ({
  page,
}) => {
  await page.goto(BUSY);
  const firsts = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="now-grid"] .lane')].map(
        (lane) => lane.querySelector('.talk')!.getBoundingClientRect().left,
      ),
    );
  const before = await firsts();
  await page.locator('[data-testid="now-grid"] .scroller').evaluate((el) => {
    el.scrollLeft += 200;
  });
  const after = await firsts();
  for (let i = 0; i < before.length; i++) expect(before[i]! - after[i]!).toBeCloseTo(200, 0);
});

test('room names are rotated into the margin and stay put while the grid scrolls', async ({
  page,
}) => {
  await page.goto(BUSY);
  const head = page.locator('[data-testid="now-grid"] .rowhead').first();
  await expect(head.locator('span')).toHaveCSS('writing-mode', 'vertical-rl');
  expect((await head.boundingBox())!.width).toBeLessThan(30);
  const before = (await head.boundingBox())!.x;
  await page.locator('[data-testid="now-grid"] .scroller').evaluate((el) => {
    el.scrollLeft += 400;
  });
  expect((await head.boundingBox())!.x).toBeCloseTo(before, 0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('your plan’s talk is the gold card, and the old plan and programme cards are gone', async ({
  page,
}) => {
  await page.goto(BUSY);
  const gold = page.locator('[data-testid="now-grid"] .talk[data-go="true"]');
  await expect(gold).toHaveCount(1);
  await expect(gold).toContainText("You're going");
  await expect(gold).toContainText('Changelogs Are Not Enough');
  await expect(page.getByRole('heading', { name: 'Your plan now' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Next in the programme' })).toHaveCount(0);
});

test('at least three rooms fit above the fold on a phone', async ({ page }) => {
  await page.goto(BUSY);
  await expect(page.locator('[data-testid="now-grid"] .talk').first()).toBeVisible();
  const { lanes, nav } = await page.evaluate(() => ({
    lanes: [...document.querySelectorAll('[data-testid="now-grid"] .lane')].map(
      (lane) => lane.getBoundingClientRect().bottom,
    ),
    nav: document.querySelector('[data-testid="nav-tabbar"]')!.getBoundingClientRect().top,
  }));
  // With the dev clock showing, which a real phone never has.
  expect(lanes.filter((bottom) => bottom <= nav).length).toBeGreaterThanOrEqual(3);
});

test('devroom talks carry their devroom’s pill and colour; main-hall talks carry none', async ({
  page,
}) => {
  await page.goto(BUSY);
  const docs = page
    .locator('[data-testid="now-grid"] .talk')
    .filter({ hasText: 'Writing Docs for Two Readers' });
  const pill = docs.locator('.pill');
  await expect(pill).toHaveText('Documentation & Technical Writing');
  // The devroom's colour, not the neutral pill: the same token the schedule uses.
  expect(await docs.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--devroom'))).toBe(
    'var(--devroom-docs)',
  );
  expect(await pill.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
    'rgba(0, 0, 0, 0)',
  );
  const hall = page
    .locator('[data-testid="now-grid"] .talk')
    .filter({ hasText: 'Optimizing Performance of GUIs' });
  await expect(hall.locator('.pill')).toHaveCount(0);
});

test('a room with nothing on says when it is next busy', async ({ page }) => {
  // 10:21 on day one: rooms 2 and 3 open at 11:00.
  await page.goto(at('2026-09-26T10:21:00+05:30'));
  const room2 = page.locator('[data-testid="now-grid"] .lane[aria-label="Room 2"]');
  await expect(room2.locator('.gap')).toContainText('Free until 11:00');
});

test('Getting there shows until 10:00 on day one and not after', async ({ page }) => {
  await page.goto(at('2026-09-26T09:00:00+05:30'));
  await expect(page.getByRole('region', { name: 'Getting there' })).toBeVisible();
  await page.goto(BUSY);
  await expect(page.locator('[data-testid="now-grid"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Getting there' })).toHaveCount(0);
});

// ---- zoom (#685) -------------------------------------------------------

/** Minutes across the view, read from the scale the cards are drawn at. */
async function windowMinutes(page: Page): Promise<number> {
  return page.evaluate(() => {
    const view = document.querySelector('[data-testid="now-grid"] .scroller')!.clientWidth;
    const card = document.querySelector('[data-testid="now-grid"] .talk')!;
    const m = /(\d\d):(\d\d)–(\d\d):(\d\d)/.exec(card.getAttribute('aria-label')!)!;
    const minutes = Number(m[3]) * 60 + Number(m[4]) - (Number(m[1]) * 60 + Number(m[2]));
    return view / ((card.getBoundingClientRect().width + 4) / minutes);
  });
}

/** The clock time at `x` px into the view, from a card spanning it. */
async function timeAt(page: Page, x: number): Promise<number> {
  return page.evaluate((x) => {
    const view = document.querySelector('[data-testid="now-grid"] .scroller')!;
    const at = view.getBoundingClientRect().left + x;
    for (const card of document.querySelectorAll('[data-testid="now-grid"] .talk')) {
      const r = card.getBoundingClientRect();
      if (r.left > at || r.right + 4 < at) continue;
      const m = /(\d\d):(\d\d)–(\d\d):(\d\d)/.exec(card.getAttribute('aria-label')!)!;
      const start = Number(m[1]) * 60 + Number(m[2]);
      const end = Number(m[3]) * 60 + Number(m[4]);
      return start + ((at - r.left) / (r.width + 4)) * (end - start);
    }
    throw new Error(`no card at ${x}`);
  }, x);
}

test('zooming is by pinch: no zoom buttons, and each step holds the left edge', async ({
  page,
}) => {
  await page.goto(BUSY);
  await expect(page.getByRole('button', { name: /Zoom (in|out)/ })).toHaveCount(0);
  await expect(page.getByTestId('now-grid-span')).toHaveText('25 min');
  const left = await timeAt(page, 1);
  const grid = page.locator('[data-testid="now-grid"] .scroller');
  await grid.focus();

  await page.keyboard.press('+');
  await expect(page.getByTestId('now-grid-span')).toHaveText('16 min');
  expect(await windowMinutes(page)).toBeCloseTo(25 / 1.6, 0);
  expect(await timeAt(page, 1)).toBeCloseTo(left, 0);

  await page.keyboard.press('-');
  await page.keyboard.press('-');
  await expect(page.getByTestId('now-grid-span')).toHaveText('40 min');
  expect(await timeAt(page, 1)).toBeCloseTo(left, 0);

  // Zoomed all the way in, a five-minute lightning talk fills the view.
  for (let i = 0; i < 6; i++) await page.keyboard.press('+');
  await expect(page.getByTestId('now-grid-span')).toHaveText('5 min');
});

test('the keyboard zooms the focused timeline with plus and minus', async ({ page }) => {
  await page.goto(BUSY);
  await page.locator('[data-testid="now-grid"] .scroller').focus();
  await page.keyboard.press('+');
  await expect(page.getByTestId('now-grid-span')).toHaveText('16 min');
  await page.keyboard.press('-');
  await expect(page.getByTestId('now-grid-span')).toHaveText('25 min');
});

test('ctrl-scroll, which is what a trackpad pinch sends, zooms about the pointer', async ({
  page,
}) => {
  await page.goto(BUSY);
  const view = (await page.locator('[data-testid="now-grid"] .scroller').boundingBox())!;
  const focal = 150;
  const before = await timeAt(page, focal);
  await page.mouse.move(view.x + focal, view.y + 40);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect(page.getByTestId('now-grid-span')).not.toHaveText('25 min');
  expect(await windowMinutes(page)).toBeLessThan(25);
  // The moment under the pointer stays under the pointer.
  expect(await timeAt(page, focal)).toBeCloseTo(before, 0);
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('a two-finger pinch widens the timeline about the fingers', async ({ page }) => {
    await page.goto(BUSY);
    const view = (await page.locator('[data-testid="now-grid"] .scroller').boundingBox())!;
    const y = view.y + 60;
    const cx = view.x + 150;
    const before = await timeAt(page, 150);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', spread: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          type === 'touchEnd'
            ? []
            : [
                { x: cx - spread, y, id: 1 },
                { x: cx + spread, y, id: 2 },
              ],
      });
    await touch('touchStart', 40);
    for (let spread = 48; spread <= 120; spread += 8) await touch('touchMove', spread);
    await touch('touchEnd', 0);
    // The fingers spread threefold: about a third of the minutes across the view.
    await expect(page.getByTestId('now-grid-span')).toHaveText('8 min');
    expect(await timeAt(page, 150)).toBeCloseTo(before, 0);
  });
});

test('a ruler along the top gives the time scale and marks now', async ({ page }) => {
  await page.goto(BUSY);
  const grid = page.getByTestId('now-grid');
  const ruler = page.getByTestId('now-grid-ruler');
  await expect(ruler.locator('.nowtime')).toHaveText('11:30');
  const view = await grid.locator('.scroller').boundingBox();
  const line = await page.getByTestId('now-line').boundingBox();
  const pill = await ruler.locator('.nowtime').boundingBox();
  // Now opens at the left edge, and its time sits whole on the line.
  expect(Math.abs(line!.x - view!.x)).toBeLessThan(3);
  expect(pill!.x).toBeGreaterThanOrEqual(view!.x - 1);
  // At 25 minutes across, a label every 5 minutes; zoomed out, fewer and coarser.
  await expect(ruler.locator('.tick').filter({ hasText: '11:40' })).toHaveCount(1);
  await grid.locator('.scroller').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('-');
  await expect(ruler.locator('.tick').filter({ hasText: '11:40' })).toHaveCount(0);
  await expect(ruler.locator('.tick').filter({ hasText: '12:00' })).toHaveCount(1);
  // No card draws a progress bar any more.
  await expect(grid.getByRole('progressbar')).toHaveCount(0);
});

test('before the event the timeline shows day one from its first session, not a notice', async ({
  page,
}) => {
  await page.goto(at('2026-09-24T20:00:00+05:30'));
  await expect(page.getByRole('heading', { name: /^Starts Sat 26 Sep · 08:00$/ })).toBeVisible();
  await expect(page.locator('[data-testid="now-grid"] .talk').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Not started yet' })).toHaveCount(0);
});

test('the Rooms view opens scrolled to now with a line across the rooms', async ({ page }) => {
  await page.goto(
    appUrl(
      `/schedule?view=rooms&event=indiafoss-2026&setup=done&now=${encodeURIComponent('2026-09-26T13:00:00+05:30')}`,
    ),
  );
  const grid = page.getByRole('region', { name: 'Schedule by room and time' });
  await expect(grid.locator('.nowline')).toBeVisible();
  expect(await grid.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('the front page offers Getting there until the conference starts', async ({ page }) => {
  const home = (time: string) =>
    appUrl(`/?event=indiafoss-2026&setup=done&now=${encodeURIComponent(time)}`);
  await page.goto(home('2026-09-24T20:00:00+05:30'));
  await expect(page.getByRole('region', { name: 'Getting there' })).toBeVisible();
  await page.goto(home('2026-09-26T11:30:00+05:30'));
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Getting there' })).toHaveCount(0);
});

test('on a desktop-wide screen the timeline opens zoomed all the way out', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BUSY);
  await expect(page.getByTestId('now-grid-span')).toHaveText('3 h');
  expect(await windowMinutes(page)).toBeCloseTo(180, -1);
});

test('the Rooms view zooms its time axis with plus, minus and ctrl-scroll', async ({ page }) => {
  await page.goto(
    appUrl(
      `/schedule?view=rooms&event=indiafoss-2026&setup=done&now=${encodeURIComponent('2026-09-26T13:00:00+05:30')}`,
    ),
  );
  const grid = page.getByRole('region', { name: /Schedule by room and time/ });
  const cell = grid.locator('.cell').first();
  await expect(cell).toBeVisible();
  const height = async () => (await cell.boundingBox())!.height;
  const before = await height();

  await grid.focus();
  await page.keyboard.press('+');
  await expect.poll(height).toBeCloseTo(before * 1.6, 0);
  await page.keyboard.press('-');
  await expect.poll(height).toBeCloseTo(before, 0);

  const box = (await grid.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 120);
  await page.keyboard.up('Control');
  await expect.poll(height).toBeLessThan(before);
});

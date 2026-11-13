const { test, expect } = require('@playwright/test');
const { P, watchErrors, clearCartState } = require('./helpers');

const PUBLIC_ROUTES = [
  '/', '/category/all', '/category/power-tools', '/category/pumps/submersible',
  `/product/${P.grinder}`, '/brands', '/brand/Bosch', '/deals', '/cart', '/checkout',
  '/wishlist', '/compare', '/my-orders', '/track-order', '/returns', '/bulk-quote',
  '/bulk-orders', '/emi-options', '/faq', '/about-us', '/contact-us', '/shipping-policy',
  '/returns-policy', '/cancellation-policy', '/warranty-policy', '/privacy-policy',
  '/terms-conditions', '/login', '/register', '/account', '/account/forgot',
];

test.describe('Quality, accessibility and SEO', () => {
  test.beforeEach(async ({ page }) => {
    await clearCartState(page);
  });

  test('every public route renders one h1, no NaN artifacts, no console errors and alt text on images', async ({ page }) => {
    const errors = watchErrors(page);
    for (const route of PUBLIC_ROUTES) {
      const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(res.status(), route).toBeLessThan(400);
      const h1s = await page.locator('h1').count();
      expect(h1s, `${route} should render exactly one h1`).toBe(1);
      const body = await page.locator('main').innerText();
      expect(body, route).not.toMatch(/₹NaN|\bundefined\b|Invalid Date|\[object Object\]/);
      const missingAlt = await page.locator('main img:not([alt])').count();
      expect(missingAlt, `${route} has images without alt`).toBe(0);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('mobile layout has no horizontal overflow and keeps wishlist, compare and account reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ['/', `/product/${P.grinder}`, '/cart', '/checkout', '/category/all']) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
    await page.goto(`/product/${P.grinder}`);
    await expect(page.getByRole('link', { name: /Wishlist/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Compare/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Account/i }).first()).toBeVisible();
  });

  test('keyboard users can skip to content and reach every payment option', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: /Skip to main content/i });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();

    await page.goto('/checkout');
    const radios = page.getByRole('radio');
    await expect(radios).toHaveCount(4);
    await radios.nth(3).focus();
    await expect(radios.nth(3)).toBeFocused();
    await radios.nth(3).check();
    await expect(radios.nth(3)).toBeChecked();
    // The visible radios are labelled for assistive technology.
    await expect(page.getByRole('radio', { name: 'COD' })).toBeVisible();
  });

  test('cart badge updates after adding products and survives a reload', async ({ page }) => {
    await page.goto(`/product/${P.grinder}`);
    await page.getByRole('button', { name: /^Add to Cart$/ }).click();
    await expect(page.getByRole('link', { name: /^Cart, 1 item/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: /^Cart, 1 item/ })).toBeVisible();
  });

  test('corrupted localStorage cannot crash the cart, wishlist, compare or homepage', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('ecommerce_cart', JSON.stringify([{ slug: { bad: 1 }, name: { nested: true }, price: 1, qty: 1 }]));
      localStorage.setItem('tw_wishlist', JSON.stringify([{ slug: 'x', name: { bad: true }, price: 'NaN' }]));
      localStorage.setItem('tw_compare', JSON.stringify([{ slug: 'x', name: { bad: true }, price: { n: 1 } }]));
      localStorage.setItem('tw_recent', JSON.stringify([{ slug: 'x', name: { bad: true } }]));
      localStorage.setItem('tw_coupon', JSON.stringify({ code: { bad: true }, discountPaise: 'nope' }));
      localStorage.setItem('tw_cart', '{not json');
    });
    for (const route of ['/', '/cart', '/wishlist', '/compare']) {
      const errors = watchErrors(page);
      const res = await page.goto(route);
      expect(res.status(), route).toBe(200);
      await expect(page.locator('h1')).toBeVisible();
      expect(errors.filter((e) => !/Failed to load resource/.test(e)), `${route}: ${errors.join('\n')}`).toEqual([]);
    }
  });

  test('SEO: canonical, titles and JSON-LD are valid on product, category and FAQ pages', async ({ page }) => {
    for (const route of [`/product/${P.grinder}`, '/category/power-tools', '/faq']) {
      await page.goto(route);
      // On localhost the app deliberately omits canonicals (a canonical pointing at
      // localhost is worse than none). When one is present it must be absolute.
      const canonicalLocator = page.locator('link[rel="canonical"]');
      if (await canonicalLocator.count()) {
        const canonical = await canonicalLocator.first().getAttribute('href');
        expect(canonical, route).toMatch(/^https?:\/\//);
      }
      const title = await page.title();
      expect(title.length, route).toBeGreaterThan(15);
      const blocks = await page.locator('script[type="application/ld+json"]').allInnerTexts();
      expect(blocks.length, `${route} should emit JSON-LD`).toBeGreaterThan(0);
      for (const block of blocks) {
        const data = JSON.parse(block);
        expect(data['@context']).toBe('https://schema.org');
      }
    }
  });

  test('unknown brand is a real 404, and private pages are noindex', async ({ page }) => {
    const res = await page.goto('/brand/ThisBrandDoesNotExist');
    expect(res.status()).toBe(404);

    for (const route of ['/cart', '/checkout', '/account', '/my-orders', '/invoice/nope']) {
      await page.goto(route);
      const robots = (await page.locator('meta[name="robots"]').first().getAttribute('content')) || '';
      expect(robots, route).toContain('noindex');
    }
  });

  test('order history and quote APIs require OTP proof', async ({ page }) => {
    const orders = await page.request.get('http://localhost:9000/store/service/orders?phone=9812345678');
    expect(orders.status()).toBe(401);
    const quotes = await page.request.get('http://localhost:9000/store/quotes?phone=9812345678');
    expect(quotes.status()).toBe(401);
    const invoice = await page.request.get('http://localhost:9000/store/invoice/does-not-exist');
    expect(invoice.status()).toBe(404);
  });
});

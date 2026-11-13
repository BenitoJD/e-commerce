const { test, expect } = require('@playwright/test');
const { P, watchErrors, clearCartState, addToCart } = require('./helpers');

test.describe('Public browsing', () => {
  test.beforeEach(async ({ page }) => {
    await clearCartState(page);
  });

  test('homepage renders hero, catalogue strips, brands and footer without errors', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page).toHaveTitle(/E-Commerce/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/made to work/i);
    await expect(page.getByRole('link', { name: /View all deals/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Shop by Category/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Brands we trust/i })).toBeVisible();
    await expect(page.locator('footer')).toContainText(/GST invoice/i);

    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/₹NaN|\bundefined\b|Invalid Date/);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('header navigation reaches every category and policy page', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    for (const [label, url, heading] of [
      ['Power Tools', '/category/power-tools', /Power Tools/i],
      ['Motors', '/category/motors', /Motors/i],
      ['Agriculture', '/category/agriculture', /Agriculture/i],
      ['Pumps', '/category/pumps', /Pumps/i],
      ['Welding', '/category/welding', /Welding/i],
      ['Cleaning', '/category/cleaning', /Cleaning/i],
    ]) {
      await page.getByRole('link', { name: label, exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(url.replace('/', '\\/')));
      await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
      await page.goBack();
    }
    // Every footer policy link resolves to a real page.
    for (const [label, url] of [
      ['Shipping Policy', '/shipping-policy'],
      ['Returns & Refunds', '/returns-policy'],
      ['Cancellation Policy', '/cancellation-policy'],
      ['Warranty Policy', '/warranty-policy'],
      ['Privacy Policy', '/privacy-policy'],
      ['Terms & Conditions', '/terms-conditions'],
      ['About Us', '/about-us'],
      ['Contact Us', '/contact-us'],
    ]) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(page.url()).toContain(url);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('typeahead suggests products and navigating a suggestion opens it', async ({ page }) => {
    await page.goto('/');
    const search = page.getByRole('combobox', { name: 'Search products' }).first();
    await search.fill('grinder');
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const options = listbox.getByRole('option');
    await expect(options.first()).toBeVisible();
    const firstName = (await options.first().innerText()).split('\n')[0];
    await options.first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The clicked suggestion must be a real product page, not a dead link.
    await expect(page).toHaveURL(/\/product\//);
    expect(await page.title()).toContain('E-Commerce');
    expect(firstName.length).toBeGreaterThan(0);
  });

  test('search submits to results, keeps the query in the heading, and handles no results', async ({ page }) => {
    await page.goto('/');
    const search = page.getByRole('combobox', { name: 'Search products' }).first();
    await search.fill('angle grinder');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/category\/all\?q=angle(\+|%20)grinder/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Results for/i);
    await expect(page.getByText(/\d+ products?/).first()).toBeVisible();

    await page.goto('/category/all?q=zzzznotarealproduct');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Results for/i);
    await expect(page.getByText(/No products match/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Ask on WhatsApp/i })).toHaveAttribute('href', /wa\.me/);

    // Clear filters restores the full catalogue.
    await page.getByRole('button', { name: /Clear filters/i }).first().click();
    await expect(page.locator('[data-testid="product-card"]').first()).toBeVisible();
  });

  test('category filtering, sorting and price bounds work together', async ({ page }) => {
    await page.goto('/category/power-tools');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Power Tools/i);
    const cards = page.locator('[data-testid="product-card"]');
    await expect(cards.first()).toBeVisible();
    const allCount = await cards.count();
    expect(allCount).toBeGreaterThan(1);

    // Brand filter narrows the grid and every card carries that brand.
    const brandSelect = page.locator('select').first();
    await brandSelect.selectOption({ label: 'Bosch' });
    await expect.poll(async () => cards.count()).toBeLessThan(allCount);
    const brandLabels = await cards.getByTestId('product-brand').allInnerTexts();
    for (const b of brandLabels) expect(b.trim().toLowerCase()).toBe('bosch');

    // Sort price low→high.
    await page.locator('select').nth(1).selectOption('low');
    await expect.poll(async () => {
      const prices = (await page.locator('[data-testid="product-card"] .font-display').allInnerTexts()).map((p) => Number(p.replace(/[^\d]/g, '')));
      return prices.every((p, i) => i === 0 || p >= prices[i - 1]);
    }).toBe(true);

    // Price bounds exclude expensive products.
    await page.getByLabel('Maximum price in rupees').fill('5000');
    await expect.poll(async () => {
      const ps = (await page.locator('[data-testid="product-card"] .font-display').allInnerTexts()).map((p) => Number(p.replace(/[^\d]/g, '')));
      return ps.every((p) => p <= 5000);
    }).toBe(true);

    // Clear filters brings the full set back.
    await page.getByRole('button', { name: /Clear filters/i }).first().click();
    await expect.poll(async () => cards.count()).toBe(allCount);
  });

  test('nested category page renders child chips with the active one marked', async ({ page }) => {
    await page.goto('/category/pumps');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Pumps/i);
    const child = page.getByRole('link', { name: /Submersible/i }).first();
    await child.click();
    await expect(page).toHaveURL(/\/category\/pumps\/submersible/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Submersible/i);
    await expect(page.locator('[aria-current="page"]').first()).toBeVisible();
  });

  test('product page shows price, specs, EMI, delivery check and adds to cart', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`/product/${P.grinder}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Bosch GWS 600/i);
    await expect(page.getByText('₹3,499').first()).toBeVisible();
    await expect(page.getByText(/You save ₹/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Specifications' })).toBeVisible();
    await expect(page.getByText(/3 mo ×/)).toBeVisible();

    // Delivery check answers for a valid pincode.
    await page.getByLabel('Pincode for delivery check').fill('560058');
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /Delivering to 560058/ })).toBeVisible();

    // Quantity stepper and add to cart.
    await page.getByRole('button', { name: '+', exact: true }).click();
    await expect(page.getByText('2', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Add to Cart$/ }).click();
    await expect(page.getByRole('button', { name: /Added/ })).toBeVisible();
    await page.getByRole('link', { name: /^Cart/ }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Your Cart/i);
    await expect(page.getByText(/Bosch GWS 600/i)).toBeVisible();
    await expect(page.getByText('₹6,998').first()).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('product image gallery thumbnails switch the main image', async ({ page }) => {
    // The Gracewood wardrobe carries three real workshop photos; the gallery must be interactive.
    await page.goto('/product/gracewood-carved-teak-wardrobe');
    const before = await page.locator('main img').first().getAttribute('src');
    await page.getByRole('button', { name: /View image 2 of 3/i }).click();
    const after = await page.locator('main img').first().getAttribute('src');
    expect(after).not.toBe(before);
    expect(after).toMatch(/gracewood-carved-wardrobe-2/);
  });

  test('wishlist add, persist across reload, move to cart and remove', async ({ page }) => {
    await page.goto(`/product/${P.grinder}`);
    const wishBtn = page.getByRole('button', { name: 'Toggle wishlist' });
    await wishBtn.click();
    await expect(wishBtn).toHaveText(/Wishlisted/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Toggle wishlist' })).toHaveText(/Wishlisted/);
    await page.getByRole('link', { name: /Wishlist/ }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Your Wishlist/i);
    await expect(page.getByText(/Bosch GWS 600/i)).toBeVisible();
    await page.getByRole('button', { name: /Move to Cart/i }).first().click();
    await expect(page.getByText(/Your wishlist is empty/i)).toBeVisible();
    await page.getByRole('link', { name: /^Cart/ }).first().click();
    await expect(page.getByText(/Bosch GWS 600/i)).toBeVisible();
  });

  test('compare adds two products, shows spec union and removes one', async ({ page }) => {
    await page.goto(`/product/${P.grinder}`);
    await page.getByRole('button', { name: /Compare/ }).click();
    await expect(page.getByRole('link', { name: /See comparison/ })).toBeVisible();
    await page.goto(`/product/${P.drill}`);
    await page.getByRole('button', { name: /Compare/ }).click();
    await expect(page.getByRole('link', { name: /See comparison/ })).toBeVisible();

    await page.goto('/compare');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Compare products/i);
    await expect(page.getByText(/Bosch GWS 600/i)).toBeVisible();
    await expect(page.getByText(/DeWalt DWD024/i)).toBeVisible();
    await expect(page.getByRole('cell', { name: /Power/i }).first()).toBeVisible();

    await page.getByRole('button', { name: /Remove DeWalt DWD024/i }).click();
    await expect(page.getByText(/DeWalt DWD024/i)).toBeHidden();
  });

  test('deals page lists discounted products and brand directory opens brands', async ({ page }) => {
    await page.goto('/deals');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Deals/i);
    await expect(page.locator('[data-testid="product-card"]').first()).toBeVisible();
    await page.goto('/brands');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Shop by Brand/i);
    await expect(page.getByText(/Featured brands/i)).toBeVisible();

    // Search narrows the directory and the A–Z control filters it further.
    const brandSearch = page.getByLabel('Search brands');
    await brandSearch.fill('Grace');
    await expect(page.getByRole('link', { name: /Gracewood/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^Bosch/ })).toHaveCount(0);
    await brandSearch.fill('');
    await page.getByRole('button', { name: 'G', exact: true }).click();
    await expect(page.getByRole('link', { name: /Gracewood/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^Bosch/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'All', exact: true }).click();

    await page.getByRole('link', { name: /Bosch/ }).first().click();
    await expect(page).toHaveURL(/\/brand\/Bosch/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Bosch/i);
    await expect(page.locator('[data-testid="product-card"]').first()).toBeVisible();
  });

  test('unknown routes, products and categories return branded 404 pages', async ({ page }) => {
    for (const url of ['/definitely-not-a-page', '/product/does-not-exist', '/category/does-not-exist']) {
      const res = await page.goto(url);
      expect(res.status()).toBe(404);
      await expect(page.getByText(/not found|404|Page not found/i).first()).toBeVisible();
    }
  });
});

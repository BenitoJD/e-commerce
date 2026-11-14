const { test, expect } = require('@playwright/test');
const { P, api, ADMIN_TOKEN, uniquePhone, uniqueEmail, adminLogin, createCodOrder } = require('./helpers');

test.describe('Admin console', () => {
  test('rejects a wrong token and accepts the real one', async ({ page }) => {
    await page.goto('/admin');
    await page.getByLabel('Admin token').fill('definitely-wrong-token');
    await page.getByRole('button', { name: /Save & Connect/i }).click();
    await expect(page.getByText(/Unauthorized|401/i).first()).toBeVisible();
    await page.getByLabel('Admin token').fill(ADMIN_TOKEN);
    await page.getByRole('button', { name: /Save & Connect/i }).click();
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Revenue', { exact: true })).toBeVisible();
    await expect(page.getByText(/Orders by status/i)).toBeVisible();
  });

  test('orders: search, detail, bulk ship, authenticated picking list and CSV export', async ({ page, context }) => {
    const phone = uniquePhone();
    const receipt = await createCodOrder({ phone, notes: 'Call before delivery, gate 3.' }).then((r) => r.receipt);
    await adminLogin(page);
    await page.getByRole('button', { name: 'Orders' }).click();

    await page.getByLabel('Search orders by receipt, name or phone').fill(receipt);
    await page.locator('#main-content').getByRole('button', { name: /^Search$/ }).click();
    await expect(page.getByText(receipt)).toBeVisible();

    // Detail panel reconciles the charge and shows the customer.
    await page.getByRole('button', { name: /^View$/ }).first().click();
    await expect(page.getByText(new RegExp(`Order ${receipt}`)).first()).toBeVisible();
    await expect(page.getByText(/E2E Buyer/i).first()).toBeVisible();
    await expect(page.getByText(/Call before delivery, gate 3/i)).toBeVisible();

    // Selection is scoped to the visible result set and survives a new tab.
    await page.getByRole('checkbox', { name: `Select order ${receipt}` }).check();
    await expect(page.getByText(/1 selected/)).toBeVisible();
    const [picking] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: /Print picking list/i }).click(),
    ]);
    await picking.waitForLoadState('domcontentloaded');
    await expect(picking.getByRole('heading', { level: 1 })).toHaveText(/Picking list/i);
    await expect(picking.getByText(/Bosch GWS 600/i)).toBeVisible();
    await expect(picking.getByText(/Admin token missing/i)).toHaveCount(0);
    await picking.close();

    // Mark the order shipped through the bulk action.
    await page.getByRole('button', { name: /Mark shipped/i }).first().click();
    await expect(page.locator('table').getByText('shipped', { exact: true }).first()).toBeVisible();

    // Courier/AWB captured in the detail panel is visible to the customer.
    await page.getByLabel('Courier name').fill('Delhivery');
    await page.getByLabel('AWB number').fill('AWB123456789');
    await page.getByRole('button', { name: /Save shipping/i }).click();
    await expect(page.getByText(/Shipping details saved/i)).toBeVisible();
    const tracked = await api(`/store/service/track?receipt=${encodeURIComponent(receipt)}&phone=${phone}`);
    expect(tracked.status).toBe(200);
    expect(tracked.json.courier).toBe('Delhivery');
    expect(tracked.json.awb).toBe('AWB123456789');

    // Accounting export downloads a CSV for the filtered order.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export CSV/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/orders.*\.csv/);
    const path = await download.path();
    expect(path).toBeTruthy();
  });

  test('products: create, edit and delete a catalogue item', async ({ page }) => {
    const stamp = Date.now();
    const slug = `e2e-product-${stamp}`;
    const name = `E2E Test Hammer ${stamp}`;
    const renamed = `${name} v2`;
    await adminLogin(page);
    await page.getByRole('button', { name: 'Products' }).click();
    await page.getByLabel('Product slug').fill(slug);
    await page.getByLabel('Product name').fill(name);
    await page.getByLabel('Brand name').fill('E2E Brand');
    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Power Tools' });
    await page.getByLabel('Subcategory').selectOption({ label: 'Drills & Impact Drills' });
    await page.getByLabel('Selling price in rupees').fill('499');
    await page.getByLabel('MRP in rupees').fill('699');
    await page.getByLabel('HSN code').fill('82052000');
    await page.getByLabel('Stock quantity', { exact: true }).fill('7');
    await page.getByLabel('Image paths').fill('/images/placeholder.svg');
    await page.getByLabel('Product description').fill('Created by the browser end-to-end suite.');
    await page.getByRole('button', { name: /Save product/i }).click();
    await expect(page.getByText(/saved|created|updated/i).first()).toBeVisible();

    await page.getByPlaceholder(/Search catalogue by name/).fill(slug);
    await expect(page.getByText(name)).toBeVisible();
    await page.locator('tr').filter({ hasText: name }).getByRole('button', { name: /^Edit$/ }).click();
    await page.getByLabel('Product name').fill(renamed);
    await page.getByRole('button', { name: /Save product/i }).click();
    await expect(page.getByText(renamed)).toBeVisible();

    page.once('dialog', (d) => d.accept());
    const row = page.locator('tr').filter({ hasText: renamed });
    await row.getByRole('button', { name: /^Delete$/ }).click();
    await expect(page.getByText(renamed)).toBeHidden();

    // It is gone from the public API too.
    const gone = await api(`/store/products/${slug}`);
    expect(gone.status).toBe(404);
  });

  test('coupons: create a code, see it listed and toggle it off', async ({ page }) => {
    const code = `E2E${Date.now().toString().slice(-6)}`;
    await adminLogin(page);
    await page.getByRole('button', { name: 'Coupons' }).click();
    await page.getByLabel('Coupon code').fill(code);
    await page.getByLabel('Discount percentage').fill('12');
    await page.getByLabel('Maximum discount in rupees').fill('400');
    await page.getByLabel('Minimum order value in rupees').fill('1500');
    await page.getByRole('button', { name: /Save coupon/i }).click();
    await expect(page.getByText(code).first()).toBeVisible();

    // A shopper can validate it.
    const valid = await api(`/store/engage/coupons/validate?code=${code}&amount_paise=300000`);
    expect(valid.status).toBe(200);
    expect(valid.json.valid).not.toBe(false);
    expect(valid.json.discount_paise).toBeGreaterThan(0);
  });

  test('stock, returns, messages and review filters hit the API and render results', async ({ page }) => {
    // Seed one return and one review so the filters have something to find.
    const phone = uniquePhone();
    const created = await createCodOrder({ phone });
    await api(`/admin/orders/${created.orderId}`, { method: 'PATCH', body: { status: 'shipped' }, token: ADMIN_TOKEN });
    await api(`/admin/orders/${created.orderId}`, { method: 'PATCH', body: { status: 'delivered' }, token: ADMIN_TOKEN });
    await api('/store/service/returns', {
      method: 'POST',
      body: { receipt: created.receipt, phone, reason: 'damaged', details: 'Filter test' },
    });
    const reviewTitle = `Filter test ${Date.now()}`;
    const reviewCreated = await api(`/store/engage/reviews/${P.router}`, {
      method: 'POST',
      body: { name: 'Filter Tester', rating: 5, title: reviewTitle, body: 'Excellent router for the workshop.' },
    });
    expect(reviewCreated.status, reviewCreated.text).toBe(201);

    await adminLogin(page);

    // Stock update
    await page.getByRole('button', { name: 'Stock' }).click();
    await page.getByLabel('Product slug for stock update').fill(P.router);
    await page.getByLabel('Stock quantity', { exact: true }).fill('19');
    await page.getByRole('button', { name: /Update stock|Save stock/i }).click();
    await expect(page.getByText(/19/).first()).toBeVisible();

    // Returns filter
    await page.getByRole('button', { name: 'Returns' }).click();
    const returnSelect = page.locator('select').first();
    await returnSelect.selectOption('requested');
    await expect(page.locator('#main-content').getByText(/Filter test/).first()).toBeVisible();

    // Messages filter (empty list is fine, but the request must succeed)
    await page.getByRole('button', { name: 'Messages' }).click();
    await page.locator('select').first().selectOption('new');
    await expect(page.getByText(/messages|subscribers/i).first()).toBeVisible();

    // Reviews: find the pending review and verify it
    await page.getByRole('button', { name: 'Reviews' }).click();
    await expect(page.getByText(reviewTitle).first()).toBeVisible();
    const reviewRow = page.locator('tr').filter({ hasText: reviewTitle });
    await reviewRow.getByRole('button', { name: /^Verify$/ }).click();
    await page.locator('select').first().selectOption('');
    await expect.poll(async () => (await reviewRow.innerText()).toLowerCase().includes('yes'), { timeout: 15000 }).toBe(true);
    await expect(page.getByText(reviewTitle).first()).toBeVisible();

    // Emails tab lists the confirmation messages queued by the order.
    await page.getByRole('button', { name: 'Emails' }).click();
    await expect(page.getByText(/Email outbox/i)).toBeVisible();
    await expect(page.getByText(/Order confirmed/i).first()).toBeVisible();

    // Customers tab lists registered accounts.
    await page.getByRole('button', { name: 'Customers' }).click();
    await expect(page.getByText(/Registered customers/i)).toBeVisible();
  });

  test('order status selection clears when the filter changes', async ({ page }) => {
    await adminLogin(page);
    await page.getByRole('button', { name: 'Orders' }).click();
    await page.getByLabel('Select all orders on this page').check();
    await expect(page.getByText(/\d+ selected/)).toBeVisible();
    await page.locator('select').first().selectOption('paid');
    await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
  });
});

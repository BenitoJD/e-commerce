const { test, expect } = require('@playwright/test');
const { P, api, ADMIN_TOKEN, uniquePhone, uniqueEmail, watchErrors } = require('./helpers');

async function deliveredOrder(phone) {
  const created = await api('/store/checkout/create', {
    method: 'POST',
    body: {
      items: [{ slug: P.grinder, qty: 1 }],
      customer: { name: 'Return Buyer', phone, email: `${phone}@example.com`, address: '12 Industrial Estate', pincode: '560058', stateCode: '29' },
      payMode: 'cod',
    },
  });
  expect(created.status).toBe(200);
  const receipt = created.json.receipt;
  const id = created.json.orderId;
  const shipped = await api(`/admin/orders/${id}`, { method: 'PATCH', body: { status: 'shipped' }, token: ADMIN_TOKEN });
  expect(shipped.status).toBe(200);
  const delivered = await api(`/admin/orders/${id}`, { method: 'PATCH', body: { status: 'delivered' }, token: ADMIN_TOKEN });
  expect(delivered.status).toBe(200);
  return receipt;
}

test.describe('Support, returns and notifications', () => {
  test('contact form and newsletter confirm success', async ({ page }) => {
    await page.goto('/contact-us');
    await page.getByLabel('Your name').fill('Support Tester');
    await page.getByLabel('Phone number').fill(uniquePhone());
    await page.getByLabel('Your message').fill('I need help choosing a 3HP motor for my workshop.');
    await page.getByRole('button', { name: /Send Message/i }).click();
    await expect(page.getByRole('status').filter({ hasText: /call you back/i })).toBeVisible();

    const email = uniqueEmail('news');
    await page.getByLabel('Email address for the newsletter').fill(email);
    await page.getByRole('button', { name: /^Join$/ }).click();
    await expect(page.getByText(/Subscribed!/)).toBeVisible();
  });

  test('bulk quote submits and the buyer can verify by OTP to see status', async ({ page }) => {
    const phone = uniquePhone();
    await page.goto('/bulk-quote');
    await page.getByLabel('Your name').fill('B2B Buyer');
    await page.getByLabel('Phone number').first().fill(phone);
    await page.getByLabel('Product you need a quote for').fill('Bosch GSB 13 RE Drill');
    await page.getByLabel('Quantity needed').fill('25');
    await page.getByLabel('Your message').fill('Need 25 units for a factory setup in Pune.');
    await page.getByRole('button', { name: /Send Quote Request/i }).click();
    await expect(page.getByRole('status').filter({ hasText: /Quote request sent/i })).toBeVisible();

    await page.getByLabel('Phone number for quote lookup').fill(phone);
    await page.getByRole('button', { name: /Send code/i }).click();
    await expect(page.getByLabel('One-time code for quote lookup')).toBeVisible();
    const notice = await page.getByRole('status').filter({ hasText: /code/i }).first().innerText();
    const otp = (notice.match(/\b(\d{6})\b/) || [])[1];
    expect(otp).toBeTruthy();
    await page.getByLabel('One-time code for quote lookup').fill(otp);
    await page.getByRole('button', { name: /^Verify$/ }).click();
    await expect(page.getByText(/Bosch GSB 13 RE Drill|bosch-gsb-13-re-drill/).first()).toBeVisible();
    await expect(page.getByText(/Received|We contacted you/i).first()).toBeVisible();
  });

  test('delivered order: eligibility check, RMA submission and status lookup', async ({ page }) => {
    const errors = watchErrors(page);
    const phone = uniquePhone();
    const receipt = await deliveredOrder(phone);

    await page.goto(`/returns?receipt=${encodeURIComponent(receipt)}`);
    await page.getByLabel('Receipt or order ID for eligibility check').fill(receipt);
    await page.getByLabel('Phone number for eligibility check').fill(phone);
    await page.getByRole('button', { name: /^Check$/ }).first().click();
    await expect(page.getByRole('status').filter({ hasText: /Eligible/i })).toBeVisible();
    const rmaForm = page.locator('form').filter({ has: page.getByRole('button', { name: /File Return Request/i }) });
    await expect(rmaForm.getByLabel('Receipt or order ID')).toHaveValue(receipt);

    await rmaForm.getByLabel('Phone number').fill(phone);
    await rmaForm.getByLabel('Return reason').selectOption('damaged');
    await rmaForm.getByLabel('Return details').fill('The housing arrived cracked; photos available.');
    await rmaForm.getByRole('button', { name: /File Return Request/i }).click();
    await expect(page.getByRole('status').filter({ hasText: /Return request #/i })).toBeVisible();

    await page.getByLabel('Receipt or order ID').last().fill(receipt);
    await page.getByLabel('Phone number').last().fill(phone);
    await page.getByRole('button', { name: /^Check$/ }).last().click();
    await expect(page.getByText(/Reason: damaged/i)).toBeVisible();
    expect(errors.join('\n')).not.toMatch(/Objects are not valid|NaN/);
  });

  test('out-of-stock alert is saved, and restocking queues the email', async ({ page }) => {
    // A SKU no earlier test rendered, so the 10s SSR cache cannot serve a stale stock value.
    const slug = 'abb-10hp-motor';
    const before = await api(`/store/products/${slug}`);
    const oldStock = before.json.product.stock;

    const zero = await api(`/admin/products/${slug}/stock`, { method: 'PATCH', body: { stock: 0 }, token: ADMIN_TOKEN });
    expect(zero.status).toBe(200);
    try {
      const email = uniqueEmail('stock');
      await page.goto(`/product/${slug}`);
      await expect(page.getByText('Out of stock').first()).toBeVisible();
      await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
      await page.getByRole('button', { name: /Notify me/i }).click();
      await expect(page.getByRole('status').filter({ hasText: /Saved/i })).toBeVisible();

      const list = await api(`/admin/stock-alerts?slug=${slug}`, { token: ADMIN_TOKEN });
      expect(JSON.stringify(list.json)).toContain(email);

      const restocked = await api(`/admin/products/${slug}/stock`, { method: 'PATCH', body: { stock: Math.max(5, oldStock) }, token: ADMIN_TOKEN });
      expect(restocked.status).toBe(200);
      expect(restocked.json.restockNotified).toBeGreaterThanOrEqual(1);
      await expect.poll(async () => {
        const notes = await api('/admin/notifications?status=logged', { token: ADMIN_TOKEN });
        return JSON.stringify(notes.json);
      }, { timeout: 15000 }).toContain(email);
    } finally {
      await api(`/admin/products/${slug}/stock`, { method: 'PATCH', body: { stock: oldStock }, token: ADMIN_TOKEN });
    }
  });

  test('unknown order receipt shows an error state instead of a fake success', async ({ page }) => {
    await page.goto('/order-success?receipt=rcpt_does_not_exist');
    await expect(page.getByRole('heading', { name: /couldn't find that order/i })).toBeVisible();
    await expect(page.getByText(/Order placed!/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Track an order/i })).toBeVisible();
  });

  test('FAQ page renders questions with FAQPage structured data', async ({ page }) => {
    const res = await page.goto('/faq');
    expect(res.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Frequently asked/i);
    await expect(page.getByText(/Is Cash on Delivery available?/i)).toBeVisible();
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().innerText();
    const data = JSON.parse(jsonLd);
    expect(data['@type']).toBe('FAQPage');
    expect(data.mainEntity.length).toBeGreaterThan(8);
  });
});

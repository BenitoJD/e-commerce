const { test, expect } = require('@playwright/test');
const {
  P, api, ADMIN_TOKEN, addToCart, clearCartState, fillAddress, uniquePhone, uniqueEmail,
  adminLogin, createCodOrder, watchErrors,
} = require('./helpers');

// Persona-level journeys. These are deliberately written the way each kind of human uses
// the store, not as feature-unit tests: a first-timer who searches, a bargain hunter, a
// business buyer who needs a tax invoice, a returning account holder, a B2B buyer, a phone
// shopper, a support operator and an attacker probing the boundaries.

async function choosePayment(page, label) {
  await page.locator('form label').filter({ hasText: new RegExp(`^${label}$`) }).click();
}

async function toCheckout(page) {
  await page.getByRole('link', { name: /^Cart/ }).first().click();
  await page.getByRole('link', { name: /Proceed to Checkout/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Checkout/i);
}

async function readDevOtp(page) {
  const notice = await page.getByRole('status').filter({ hasText: /code/i }).first().innerText();
  const otp = (notice.match(/\b(\d{6})\b/) || [])[1];
  expect(otp, `expected a development OTP in: ${notice}`).toBeTruthy();
  return otp;
}

test.describe('Persona journeys', () => {
  test.beforeEach(async ({ page }) => {
    await clearCartState(page);
  });

  test('first-time guest: searches, buys with COD, gets invoice and tracks it', async ({ page }) => {
    const errors = watchErrors(page);
    const phone = uniquePhone();

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/made to work/i);
    const search = page.getByRole('combobox', { name: 'Search products' }).first();
    await search.fill('angle grinder');
    const option = page.getByRole('listbox').getByRole('option').first();
    await expect(option).toBeVisible();
    await option.click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/grinder/i);

    await page.getByRole('button', { name: /^Add to Cart$/ }).click();
    await toCheckout(page);
    // Guest checkout: the form is usable without an account and collects an email for updates.
    await expect(page.getByLabel('Email for order updates')).toBeVisible();
    await fillAddress(page, { phone, notes: 'Ring the bell at gate 2.' });
    await choosePayment(page, 'COD');
    await page.getByRole('button', { name: /Pay ₹/ }).click();
    await expect(page).toHaveURL(/order-success\?receipt=/);
    const receipt = new URL(page.url()).searchParams.get('receipt');
    await expect(page.getByText('COD', { exact: true }).first()).toBeVisible();

    await page.getByRole('link', { name: /GST Invoice/i }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Tax Invoice/i);
    await expect(page.locator('body')).toContainText(receipt);
    await expect(page.locator('body')).toContainText(phone);

    await page.goto(`/track-order?receipt=${encodeURIComponent(receipt)}&phone=${phone}`);
    await expect(page.getByText(/Receipt:/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Cancel order/i })).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('deal hunter: browses deals, compares, saves a wishlist and applies a coupon', async ({ page }) => {
    await page.goto('/deals');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Deals/i);
    const cards = page.locator('[data-testid="product-card"]');
    await expect(cards.first()).toBeVisible();
    const firstHref = await cards.first().getAttribute('href');
    const secondHref = await cards.nth(1).getAttribute('href');
    expect(firstHref).toMatch(/\/product\//);
    expect(secondHref).toMatch(/\/product\//);

    await page.goto(firstHref);
    const firstName = await page.getByRole('heading', { level: 1 }).innerText();
    await page.getByRole('button', { name: 'Toggle wishlist' }).click();
    await expect(page.getByRole('button', { name: 'Toggle wishlist' })).toHaveText(/Wishlisted/);
    await page.getByRole('button', { name: /Compare/ }).click();
    await page.getByRole('button', { name: /^Add to Cart$/ }).click();

    await page.goto(secondHref);
    await page.getByRole('button', { name: /Compare/ }).click();
    await page.goto('/compare');
    await expect(page.getByText(firstName.split(' ').slice(0, 3).join(' ')).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Remove/i }).first()).toBeVisible();

    await page.goto('/wishlist');
    await expect(page.getByText(firstName.split(' ').slice(0, 3).join(' ')).first()).toBeVisible();

    await page.getByRole('link', { name: /^Cart/ }).first().click();
    await page.getByLabel('Coupon code').fill('WELCOME10');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /Coupon applied/i })).toBeVisible();
    await expect(page.getByText(/You save ₹/)).toBeVisible();
    const total = await page.locator('main').innerText();
    expect(total).not.toMatch(/₹NaN|undefined|Invalid Date/);
  });

  test('business buyer: GST invoice, COD cap and prepaid online payment', async ({ page }) => {
    await addToCart(page, P.washer, 1);
    await toCheckout(page);
    await fillAddress(page, {
      phone: uniquePhone(),
      name: 'Patel Machinery Pvt Ltd',
      gstin: '29AAGCB7383J1Z4', // Karnataka: inter-state from the Maharashtra seller
      notes: 'Tax invoice required for input credit.',
    });
    await expect(page.getByText(/COD is available up to/i)).toBeVisible();
    await expect(page.locator('form label').filter({ hasText: /^COD$/ })).toHaveClass(/cursor-not-allowed/);

    // Above the COD cap the buyer must pay online; development uses the mock gateway.
    await choosePayment(page, 'UPI');
    await page.getByRole('button', { name: /Pay ₹/ }).click();
    await expect(page.getByRole('button', { name: /Simulate successful payment/i })).toBeVisible();
    await page.getByRole('button', { name: /Simulate successful payment/i }).click();
    await expect(page).toHaveURL(/order-success\?receipt=/);
    const receipt = new URL(page.url()).searchParams.get('receipt');
    await expect(page.getByText(/Paid/i).first()).toBeVisible();

    await page.getByRole('link', { name: /GST Invoice/i }).click();
    const body = page.locator('body');
    await expect(body).toContainText('29AAGCB7383J1Z4');
    await expect(body).toContainText(/IGST/);
    await expect(body).toContainText(/Online \(Razorpay\)/);
    await expect(body).toContainText('₹27,999');

    // The server (not the browser) owns the amount and the paid status.
    const verified = await api(`/store/checkout/verify?receipt=${encodeURIComponent(receipt)}`);
    expect(verified.status).toBe(200);
    expect(verified.json.status).toBe('paid');
    expect(verified.json.amount_paise).toBe(2799900);
  });

  test('returning customer: saved address, account history and one-click reorder', async ({ page }) => {
    const email = uniqueEmail('returning');
    const phone = uniquePhone();
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Meera Iyer');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Phone number').fill(phone);
    await page.getByLabel('Password', { exact: true }).fill('Secret12345');
    await page.getByLabel('Confirm password').fill('Secret12345');
    await page.getByRole('button', { name: /Create account/i }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hi, Meera/i);

    await page.getByRole('button', { name: /Addresses/i }).click();
    await page.getByLabel('Address label').fill('Home');
    await page.getByLabel('Address full name').fill('Meera Iyer');
    await page.getByLabel('Address phone').fill(phone);
    await page.getByLabel('Address street').fill('14 Residency Road');
    await page.getByLabel('Address pincode').fill('560025');
    await page.getByLabel('Address state').selectOption({ label: 'Karnataka' });
    await page.getByRole('button', { name: /Save address/i }).click();
    await expect(page.getByText(/Home • Default|Home/).first()).toBeVisible();

    await addToCart(page, P.grinder, 1);
    await toCheckout(page);
    await expect(page.getByLabel('Full name')).toHaveValue('Meera Iyer');
    await expect(page.getByLabel('Phone number')).toHaveValue(phone);
    await expect(page.getByLabel('Delivery address')).toHaveValue(/14 Residency Road/);
    await choosePayment(page, 'COD');
    await page.getByRole('button', { name: /Pay ₹/ }).click();
    await expect(page).toHaveURL(/order-success/);
    const receipt = new URL(page.url()).searchParams.get('receipt');

    await page.goto('/account');
    const orderRow = page.locator('div.card').filter({ hasText: receipt });
    await expect(orderRow).toBeVisible();
    await expect(orderRow).toContainText(/Bosch GWS 600/i);
    await orderRow.getByRole('button', { name: /Reorder/i }).click();
    await expect(page).toHaveURL(/\/cart/);
    await expect(page.getByText(/Bosch GWS 600/i)).toBeVisible();

    await page.goto('/account');
    await page.getByRole('button', { name: /Sign out/i }).click();
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password').fill('Secret12345');
    await page.getByRole('button', { name: /^Sign in/i }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hi, Meera/i);
    await page.goto('/account');
    await expect(page.getByText(receipt)).toBeVisible();
  });

  test('B2B wholesale buyer: quote request, customer status and staff conversion', async ({ page }) => {
    const phone = uniquePhone();
    const marker = `Wholesale ${Date.now()}`;
    await page.goto('/bulk-quote');
    await page.getByLabel('Your name').fill('Rao Industrials');
    await page.getByLabel('Phone number').first().fill(phone);
    await page.getByLabel('Product you need a quote for').fill('Bosch GSB 13 RE Drill');
    await page.getByLabel('Quantity needed').fill('5');
    await page.getByLabel('Your message').fill(marker);
    await page.getByRole('button', { name: /Send Quote Request/i }).click();
    await expect(page.getByRole('status').filter({ hasText: /Quote request sent/i })).toBeVisible();

    await page.getByLabel('Phone number for quote lookup').fill(phone);
    await page.getByRole('button', { name: /Send code/i }).click();
    await page.getByLabel('One-time code for quote lookup').fill(await readDevOtp(page));
    await page.getByRole('button', { name: /^Verify$/ }).click();
    await expect(page.getByText(/Bosch GSB 13 RE Drill|bosch-gsb-13-re-drill/).first()).toBeVisible();
    await expect(page.getByText(/Received|We contacted you/i).first()).toBeVisible();

    await adminLogin(page);
    await page.getByRole('button', { name: 'Quotes' }).click();
    const quoteRow = page.locator('tr').filter({ hasText: marker });
    await expect(quoteRow).toBeVisible();
    await quoteRow.getByRole('button', { name: /Convert to order/i }).click();
    await expect(page.getByText(/Converted to order|Order rcpt_/i).first()).toBeVisible();

    const adminQuotes = await api('/admin/quotes', { token: ADMIN_TOKEN });
    const converted = (adminQuotes.json.quotes || []).find((q) => q.message === marker);
    expect(converted.status).toBe('won');
    expect(converted.order_receipt).toMatch(/^rcpt_/);

    // Release the reserved stock so repeated runs of this journey stay deterministic.
    const orders = await api(`/admin/orders?q=${encodeURIComponent(converted.order_receipt)}&limit=10`, { token: ADMIN_TOKEN });
    const createdOrder = (orders.json.orders || []).find((o) => o.receipt === converted.order_receipt);
    if (createdOrder) {
      await api(`/admin/orders/${createdOrder.id}`, { method: 'PATCH', body: { status: 'cancelled' }, token: ADMIN_TOKEN });
    }
  });

  test('mobile shopper: shops and checks out at 390px without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/product/${P.drill}`);
    await expect(page.getByRole('link', { name: /Wishlist/i }).first()).toBeVisible();
    await page.getByRole('button', { name: /^Add to Cart$/ }).click();
    await page.getByRole('link', { name: /^Cart/ }).first().click();
    const cartOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(cartOverflow).toBeLessThanOrEqual(1);
    await page.getByRole('link', { name: /Proceed to Checkout/i }).click();
    await fillAddress(page, { phone: uniquePhone(), name: 'Mobile Buyer' });
    await choosePayment(page, 'COD');
    await page.getByRole('button', { name: /Pay ₹/ }).click();
    await expect(page).toHaveURL(/order-success/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('support agent: shipping/AWB, return approval and contact triage', async ({ page }) => {
    const phone = uniquePhone();
    const created = await createCodOrder({ phone, notes: 'Support persona order' });
    const receipt = created.receipt;
    await api(`/admin/orders/${created.orderId}`, { method: 'PATCH', body: { status: 'shipped' }, token: ADMIN_TOKEN });
    await api(`/admin/orders/${created.orderId}`, { method: 'PATCH', body: { status: 'delivered' }, token: ADMIN_TOKEN });
    const rma = await api('/store/service/returns', {
      method: 'POST',
      body: { receipt, phone, reason: 'damaged', details: 'Support persona RMA' },
    });
    expect(rma.status).toBe(201);
    const marker = `Need installation help ${Date.now()}`;
    const contact = await api('/store/service/contact', {
      method: 'POST',
      body: { name: 'Support Persona', phone, message: marker },
    });
    expect(contact.status).toBe(201);

    await adminLogin(page);
    await page.getByRole('button', { name: 'Orders' }).click();
    await page.getByLabel('Search orders by receipt, name or phone').fill(receipt);
    await page.locator('#main-content').getByRole('button', { name: /^Search$/ }).click();
    await page.getByRole('button', { name: /^View$/ }).first().click();
    await page.getByLabel('Courier name').fill('Blue Dart');
    await page.getByLabel('AWB number').fill('BD99887766');
    await page.getByRole('button', { name: /Save shipping/i }).click();
    await expect(page.getByText(/Shipping details saved/i)).toBeVisible();

    await page.getByRole('button', { name: 'Returns' }).click();
    const returnRow = page.locator('tr').filter({ hasText: receipt });
    await expect(returnRow).toBeVisible();
    await returnRow.getByRole('button', { name: /^approved$/ }).click();
    await expect(returnRow).toContainText('approved');

    await page.getByRole('button', { name: 'Messages' }).click();
    const messageRow = page.locator('tr').filter({ hasText: marker });
    await expect(messageRow).toBeVisible();
    await messageRow.getByRole('button', { name: /^contacted$/ }).click();
    await expect(messageRow).toContainText('contacted');

    const tracked = await api(`/store/service/track?receipt=${encodeURIComponent(receipt)}&phone=${phone}`);
    expect(tracked.json.courier).toBe('Blue Dart');
    expect(tracked.json.awb).toBe('BD99887766');
    const status = await api(`/store/service/returns?receipt=${encodeURIComponent(receipt)}&phone=${phone}`);
    expect(status.json.return.status).toBe('approved');
  });


  test('homeowner furnishing a room: browses the Gracewood furniture photos and gallery', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Furniture', exact: true }).first().click();
    await expect(page).toHaveURL(/\/category\/furniture/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Furniture/i);

    const cards = page.locator('[data-testid="product-card"]');
    await expect(cards).toHaveCount(6);
    const broken = await cards.locator('img').evaluateAll((imgs) => imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')));
    expect(broken, `broken furniture images: ${broken.join(', ')}`).toEqual([]);

    // Wardrobe has three real photos; the thumbnails must switch the main image.
    await page.locator('[data-testid="product-card"]').filter({ hasText: 'Carved Teak Wardrobe' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Carved Teak Wardrobe/i);
    await expect(page.getByRole('button', { name: /View image 3 of 3/i })).toBeVisible();
    const main = page.locator('main img').first();
    await expect(main).toHaveAttribute('src', /gracewood-carved-wardrobe\.jpg/);
    await page.getByRole('button', { name: /View image 2 of 3/i }).click();
    await expect(main).toHaveAttribute('src', /gracewood-carved-wardrobe-2\.jpg/);

    await page.goto('/category/furniture/doors');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Doors/i);
    await page.locator('[data-testid="product-card"]').filter({ hasText: 'Hand-Carved Teak Door' }).click();
    await expect(page.locator('main img').first()).toHaveAttribute('src', /gracewood-carved-door\.jpg/);
    await page.getByRole('button', { name: /^Add to Cart$/ }).click();
    await page.getByRole('link', { name: /^Cart/ }).first().click();
    await expect(page.getByText(/Hand-Carved Teak Door/i)).toBeVisible();
    await expect(page.getByText('₹34,999').first()).toBeVisible();
  });

  test('attacker: cannot tamper prices, forge payments, guess OTPs, oversell stock or reach admin', async ({ page }) => {
    // No token / wrong token cannot read the admin API.
    expect((await api('/admin/orders')).status).toBe(401);
    expect((await api('/admin/orders', { token: 'wrong-token' })).status).toBe(401);

    // A forged webhook (no valid signature) is rejected.
    const forged = await api('/webhooks/razorpay', {
      method: 'POST',
      body: { event: 'payment.captured', payload: { payment: { entity: { order_id: 'order_fake', amount: 100 } } } },
    });
    expect(forged.status).toBe(400);

    // Client-provided prices are ignored: the server charges the catalogue price.
    const attackerPhone = uniquePhone();
    const tampered = await api('/store/checkout/create', {
      method: 'POST',
      body: {
        items: [{ slug: P.grinder, qty: 1, price: 1 }],
        customer: { name: 'Attacker', phone: attackerPhone, email: 'attacker@example.com', address: 'X', pincode: '560001', stateCode: '29' },
        payMode: 'cod',
        amount: 1,
      },
    });
    expect(tampered.status).toBe(200);
    expect(tampered.json.amount_paise).toBe(349900);
    const verified = await api(`/store/checkout/verify?receipt=${encodeURIComponent(tampered.json.receipt)}`);
    expect(verified.json.status).toBe('cod_pending');
    const cancelled = await api('/store/service/cancel', {
      method: 'POST',
      body: { receipt: tampered.json.receipt, phone: attackerPhone },
    });
    expect(cancelled.status).toBe(200);

    // OTP guessing is capped at five attempts.
    const phone = uniquePhone();
    const otp = await api('/store/auth/otp/request', { method: 'POST', body: { phone } });
    expect(otp.status).toBe(200);
    expect(otp.json.devCode).toMatch(/^\d{6}$/);
    for (let i = 0; i < 5; i += 1) {
      const wrong = await api('/store/auth/otp/verify', { method: 'POST', body: { phone, code: '000000' } });
      expect([400, 401].includes(wrong.status)).toBe(true);
    }
    const blocked = await api('/store/auth/otp/verify', { method: 'POST', body: { phone, code: otp.json.devCode } });
    expect(blocked.status).toBe(429);

    // Two buyers race for the last unit: exactly one wins, the other is told honestly.
    await api(`/admin/products/${P.router}/stock`, { method: 'PATCH', body: { stock: 1 }, token: ADMIN_TOKEN });
    try {
      const buyer = (phone2) => ({
        items: [{ slug: P.router, qty: 1 }],
        customer: { name: 'Racer', phone: phone2, email: `${phone2}@example.com`, address: 'X', pincode: '560001', stateCode: '29' },
        payMode: 'cod',
      });
      const phoneA = uniquePhone();
      const phoneB = uniquePhone();
      const [a, b] = await Promise.all([
        api('/store/checkout/create', { method: 'POST', body: buyer(phoneA) }),
        api('/store/checkout/create', { method: 'POST', body: buyer(phoneB) }),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      const winner = a.status === 200 ? { res: a, phone: phoneA } : { res: b, phone: phoneB };
      expect(winner.res.json.amount_paise).toBe(949900);
      const released = await api('/store/service/cancel', {
        method: 'POST',
        body: { receipt: winner.res.json.receipt, phone: winner.phone },
      });
      expect(released.status).toBe(200);
    } finally {
      await api(`/admin/products/${P.router}/stock`, { method: 'PATCH', body: { stock: 50 }, token: ADMIN_TOKEN });
    }
  });
});

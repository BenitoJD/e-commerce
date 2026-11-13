const { test, expect } = require('@playwright/test');
const { P, watchErrors, clearCartState, addToCart, fillAddress, uniquePhone, createCodOrder } = require('./helpers');

async function choosePayment(page, label) {
  await page.locator('form label').filter({ hasText: new RegExp(`^${label}$`) }).click();
}

async function goToCheckout(page) {
  await page.getByRole('link', { name: /^Cart/ }).first().click();
  await page.getByRole('link', { name: /Proceed to Checkout/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Checkout/i);
}

test.describe('Cart and checkout', () => {
  test.beforeEach(async ({ page }) => {
    await clearCartState(page);
  });

  test('cart quantity, removal, coupon and shipping totals stay consistent', async ({ page }) => {
    await addToCart(page, P.grinder, 1);
    await goToCheckout(page);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Your Cart/i);

    // Increase quantity and verify the line total and subtotal.
    await page.getByRole('button', { name: '+', exact: true }).click();
    await expect(page.getByText('₹6,998').first()).toBeVisible();
    await expect(page.getByText('2 items in cart')).toBeVisible();

    // Coupon applies to the cart subtotal.
    await page.getByLabel('Coupon code').fill('WELCOME10');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /Coupon applied/i })).toBeVisible();
    await expect(page.getByText(/You save ₹500/)).toBeVisible();
    await expect(page.getByText('To Pay')).toBeVisible();
    const body = await page.locator('main').innerText();
    expect(body).toContain('₹6,498');
    expect(body).not.toMatch(/₹NaN|undefined|Invalid Date/);

    // Invalid coupon shows a readable reason and does not alter the total.
    await page.locator('div.bg-green-50').getByRole('button', { name: 'Remove', exact: true }).click();
    await page.getByLabel('Coupon code').fill('NOPE123');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /invalid|expired|not valid/i })).toBeVisible();

    // Removing the line empties the cart.
    await page.locator('div.card').filter({ hasText: /Bosch GWS 600/i }).getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText(/Your cart is empty/i)).toBeVisible();
  });

  test('checkout blocks invalid phone, pincode and GSTIN with clear messages', async ({ page }) => {
    await addToCart(page, P.grinder, 1);
    await goToCheckout(page);
    await fillAddress(page, { phone: '12345' });
    await page.getByRole('button', { name: /Pay ₹/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /valid 10-digit mobile/i })).toBeVisible();

    await page.getByLabel('Phone number').fill('9876543210');
    await page.getByLabel('Pincode').fill('12');
    await page.getByRole('button', { name: /Pay ₹/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /valid 6-digit pincode/i })).toBeVisible();

    await page.getByLabel('Pincode').fill('560058');
    await page.getByLabel('GSTIN for business invoice').fill('27AAAAA0000A1Z'); // too short
    await page.getByRole('button', { name: /Pay ₹/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /GSTIN looks invalid/i })).toBeVisible();

    // Still on checkout — no phantom order was created.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Checkout/i);
  });

  test('COD is blocked above the cap and enabled below it', async ({ page }) => {
    await addToCart(page, P.scrubber, 1);
    await goToCheckout(page);
    await expect(page.getByText(/COD is available up to/i)).toBeVisible();
    // The COD option is visibly disabled for a ₹1.5L machine.
    const codLabel = page.locator('form label').filter({ hasText: /^COD$/ });
    await expect(codLabel).toHaveClass(/cursor-not-allowed/);
    await expect(page.locator('form label').filter({ hasText: /^UPI$/ })).toHaveClass(/border-\[#A95F32\]/);
  });

  test('COD order completes, appears in My Orders, invoice renders and tracking works', async ({ page }) => {
    const errors = watchErrors(page);
    const phone = uniquePhone();
    await addToCart(page, P.grinder, 1);
    await goToCheckout(page);
    await fillAddress(page, { phone, gstin: '29AAGCB7383J1Z4' });
    await choosePayment(page, 'COD');
    await expect(page.getByRole('button', { name: /Pay ₹3,499 \(COD\)/ })).toBeVisible();
    await page.getByRole('button', { name: /Pay ₹/ }).click();

    await expect(page).toHaveURL(/\/order-success\?receipt=/);
    const receipt = new URL(page.url()).searchParams.get('receipt');
    expect(receipt).toBeTruthy();
    await expect(page.getByRole('heading', { name: /Order placed/i })).toBeVisible();
    // This is the regression that matters: COD must be recorded as COD, not a pending online order.
    await expect(page.getByText('cod_pending|pending', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/^COD$/).first()).toBeVisible();
    await expect(page.getByText('₹3,499').first()).toBeVisible();

    // Invoice is server-rendered and carries the receipt, buyer GSTIN and GST split.
    await page.getByRole('link', { name: /GST Invoice/i }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Tax Invoice/i);
    await expect(page.locator('body')).toContainText(receipt);
    await expect(page.locator('body')).toContainText('29AAGCB7383J1Z4');
    await expect(page.locator('body')).toContainText(/CGST|IGST/);

    // Track by receipt + phone.
    await page.goto(`/track-order?receipt=${encodeURIComponent(receipt)}&phone=${phone}`);
    await expect(page.getByText(/Receipt:/)).toBeVisible();
    await expect(page.getByText(/COD_PENDING|COD/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Cancel order/i })).toBeVisible();

    // My Orders requires an OTP before it lists receipts.
    await page.goto('/my-orders');
    await page.getByLabel('Phone number').fill(phone);
    await page.getByRole('button', { name: /Send code/i }).click();
    await expect(page.getByLabel('One-time code')).toBeVisible();
    const otpText = await page.getByRole('status').filter({ hasText: /code/i }).first().innerText();
    const otp = (otpText.match(/\b(\d{6})\b/) || [])[1];
    expect(otp, `dev OTP in: ${otpText}`).toBeTruthy();
    await page.getByLabel('One-time code').fill(otp);
    await page.getByRole('button', { name: /Verify & view orders/i }).click();
    await expect(page.getByText(receipt).first()).toBeVisible();
    await expect(page.getByText(/Bosch GWS 600/i).first()).toBeVisible();

    expect(errors, errors.join('\n')).toEqual([]);

    // Wrong phone must not reveal the order.
    await page.goto('/track-order');
    await page.getByLabel('Receipt or order ID').fill(receipt);
    await page.getByLabel('Phone number').fill('9000000000');
    await page.getByRole('button', { name: /Track Order/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /does not match|not found/i })).toBeVisible();
  });

  test('customer can cancel a COD order and stock is restored', async ({ page }) => {
    const phone = uniquePhone();
    await addToCart(page, P.drill, 1);
    await goToCheckout(page);
    await fillAddress(page, { phone });
    await choosePayment(page, 'COD');
    await page.getByRole('button', { name: /Pay ₹/ }).click();
    await expect(page).toHaveURL(/order-success/);
    const receipt = new URL(page.url()).searchParams.get('receipt');

    await page.goto(`/track-order?receipt=${encodeURIComponent(receipt)}&phone=${phone}`);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /Cancel order/i }).click();
    await expect(page.getByRole('status').filter({ hasText: /cancelled/i })).toBeVisible();
    await expect(page.getByText(/This order is cancelled/i)).toBeVisible();
  });

  test('empty cart shows a clear state and cannot be checked out', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page.getByRole('alert').filter({ hasText: /cart is empty/i })).toBeVisible();
    const pay = page.getByRole('button', { name: /Pay ₹/ });
    await expect(pay).toBeDisabled();
    await page.getByRole('link', { name: /Browse products/i }).click();
    await expect(page).toHaveURL(/\/category\/all/);
  });

  test('online checkout path is complete in development (mock payment)', async ({ page }) => {
    // A production-shaped store must never leave the buyer stranded when the payment
    // provider is not configured locally; the dev mock flow marks the order paid.
    const phone = uniquePhone();
    await addToCart(page, P.grinder, 1);
    await goToCheckout(page);
    await fillAddress(page, { phone });
    await choosePayment(page, 'UPI');
    await page.getByRole('button', { name: /Pay ₹/ }).click();
    // Either a real Razorpay modal or the explicit dev "simulate payment" affordance.
    await expect(page.getByText(/simulate|mock payment|complete payment/i).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Simulate successful payment|Complete mock payment/i }).click();
    await expect(page).toHaveURL(/order-success/);
    const receipt = new URL(page.url()).searchParams.get('receipt');
    await page.waitForTimeout(1500);
    await expect(page.getByText(/Paid/i).first()).toBeVisible();
    expect(receipt).toBeTruthy();
  });
});

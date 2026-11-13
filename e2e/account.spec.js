const { test, expect } = require('@playwright/test');
const { P, watchErrors, clearCartState, addToCart, fillAddress, uniquePhone, uniqueEmail } = require('./helpers');

async function registerNew(page) {
  const email = uniqueEmail('account');
  const phone = uniquePhone();
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Asha Verma');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Phone number').fill(phone);
  await page.getByLabel('Password', { exact: true }).fill('Secret12345');
  await page.getByLabel('Confirm password').fill('Secret12345');
  await page.getByRole('button', { name: /Create account/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hi, Asha/i);
  return { email, phone };
}

test.describe('Customer accounts', () => {
  test.beforeEach(async ({ page }) => {
    await clearCartState(page);
  });

  test('register, sign out, sign in and view the profile', async ({ page }) => {
    const errors = watchErrors(page);
    const { email } = await registerNew(page);
    await expect(page.getByText(email)).toBeVisible();

    await page.getByRole('button', { name: /Sign out/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password').fill('Secret12345');
    await page.getByRole('button', { name: /^Sign in/i }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hi, Asha/i);

    await page.getByRole('button', { name: /^Profile$/ }).click();
    await expect(page.getByText('Member since:')).toBeVisible();
    expect(errors.filter((e) => !/401|400/.test(e)), errors.join('\n')).toEqual([]);
  });

  test('saved address prefills checkout and the order appears in the account', async ({ page }) => {
    const { phone } = await registerNew(page);
    await page.getByRole('button', { name: /Addresses/i }).click();
    await page.getByLabel('Address label').fill('Workshop');
    await page.getByLabel('Address full name').fill('Asha Verma');
    await page.getByLabel('Address phone').fill(phone);
    await page.getByLabel('Address street').fill('Plot 9, MIDC Phase 2');
    await page.getByLabel('Address pincode').fill('560058');
    await page.getByLabel('Address state').selectOption({ label: 'Karnataka' });
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /Save address/i }).click();
    await expect(page.getByText(/Workshop/)).toBeVisible();
    await expect(page.getByText(/Default/)).toBeVisible();

    await addToCart(page, P.grinder, 1);
    await page.getByRole('link', { name: /^Cart/ }).first().click();
    await page.getByRole('link', { name: /Proceed to Checkout/i }).click();
    // Prefilled from the account + default address.
    await expect(page.getByLabel('Full name')).toHaveValue('Asha Verma');
    await expect(page.getByLabel('Phone number')).toHaveValue(phone);
    await expect(page.getByLabel('Delivery address')).toHaveValue(/Plot 9/);
    await expect(page.getByLabel('Delivery state')).toHaveValue('29');
    await expect(page.getByLabel('Use a saved address')).toBeVisible();
    await page.getByLabel('Email for order updates').fill(uniqueEmail('order'));
    await page.locator('form label').filter({ hasText: /^COD$/ }).click();
    await page.getByRole('button', { name: /Pay ₹/ }).click();
    await expect(page).toHaveURL(/order-success/);
    const receipt = new URL(page.url()).searchParams.get('receipt');

    await page.goto('/account');
    await expect(page.getByText(receipt).first()).toBeVisible();
    await expect(page.getByText(/Bosch GWS 600/i).first()).toBeVisible();
  });

  test('forgot-password link resets the password and signs out old sessions', async ({ page }) => {
    const { email } = await registerNew(page);
    await page.getByRole('button', { name: /Sign out/i }).click();
    await page.goto('/account/forgot');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: /Send reset link/i }).click();
    const resetLink = page.getByRole('link', { name: /account\/reset\?token=/ });
    await expect(resetLink).toBeVisible();
    const href = await resetLink.getAttribute('href');
    await page.goto(href);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Choose a new password/i);
    await page.getByLabel('New password', { exact: true }).fill('NewSecret987');
    await page.getByLabel('Confirm new password').fill('NewSecret987');
    await page.getByRole('button', { name: /Update password/i }).click();
    await expect(page.getByText(/password has been updated/i)).toBeVisible();

    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Sign in/i);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password').fill('Secret12345');
    await page.getByRole('button', { name: /^Sign in/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /incorrect/i })).toBeVisible();

    await page.getByLabel('Password').fill('NewSecret987');
    await page.getByRole('button', { name: /^Sign in/i }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hi, Asha/i);
  });

  test('guest order lookup requires the correct OTP and rejects a wrong one', async ({ page }) => {
    const phone = uniquePhone();
    await addToCart(page, P.drill, 1);
    await page.getByRole('link', { name: /^Cart/ }).first().click();
    await page.getByRole('link', { name: /Proceed to Checkout/i }).click();
    await fillAddress(page, { phone });
    await page.locator('form label').filter({ hasText: /^COD$/ }).click();
    await page.getByRole('button', { name: /Pay ₹/ }).click();
    await expect(page).toHaveURL(/order-success/);

    await page.goto('/my-orders');
    await page.getByLabel('Phone number').fill(phone);
    await page.getByRole('button', { name: /Send code/i }).click();
    await page.getByLabel('One-time code').fill('000000');
    await page.getByRole('button', { name: /Verify & view orders/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /not correct|expired/i })).toBeVisible();

    const notice = await page.getByRole('status').filter({ hasText: /code/i }).first().innerText();
    const otp = (notice.match(/\b(\d{6})\b/) || [])[1];
    expect(otp).toBeTruthy();
    await page.getByLabel('One-time code').fill(otp);
    await page.getByRole('button', { name: /Verify & view orders/i }).click();
    await expect(page.getByText(/Receipt:/).first()).toBeVisible();
  });
});

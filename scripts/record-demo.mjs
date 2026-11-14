// Records a polished storefront demo to demo/ecommerce-demo.mp4.
//
//   node scripts/record-demo.mjs
//
// Requires the storefront (:3000) and API (:9000) running, plus the Playwright Chromium
// browser. Video is captured at 1920x1080 with an injected caption track, a visible
// cursor, an intro/outro and natural scrolling; ffmpeg then transcodes to H.264 MP4.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-admin-token-please-change-123456';
const OUT_DIR = path.join(ROOT, 'demo');
const RAW_DIR = path.join(OUT_DIR, 'raw');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(RAW_DIR, { recursive: true, force: true });
mkdirSync(RAW_DIR, { recursive: true });

const introHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} html,body{height:100%} body{margin:0;background:#F5EFE4;color:#181410;font-family:Georgia,'Times New Roman',serif;display:grid;place-items:center;overflow:hidden}
  .grain{position:fixed;inset:0;background:radial-gradient(circle at 75% 15%, rgba(169,95,50,.12), transparent 45%),radial-gradient(circle at 15% 85%, rgba(24,20,16,.06), transparent 50%)}
  .wrap{position:relative;text-align:center;padding:40px}
  .eyebrow{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:#A95F32}
  .word{font-size:72px;line-height:1;letter-spacing:-.04em;margin-top:18px}
  .rule{width:52px;height:1px;background:#A95F32;margin:32px auto}
  h1{font-weight:400;font-size:46px;line-height:1.05;margin:0;letter-spacing:-.03em}
  h1 em{font-style:italic;color:#A95F32}
  p{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#6F6357;margin-top:30px}
</style></head><body><div class="grain"></div><div class="wrap">
  <div class="eyebrow">Pune · India</div>
  <div class="word">E-Commerce</div>
  <div class="rule"></div>
  <h1>Made to work.<br><em>Made to stay.</em></h1>
  <p>Machinery · Tools · Handcrafted furniture</p>
</div></body></html>`;

const overlayCss = `
  #demo-cursor{position:fixed;left:-100px;top:-100px;width:26px;height:26px;border:2px solid #A95F32;background:rgba(255,253,248,.35);box-shadow:0 2px 12px rgba(24,20,16,.28),0 0 0 3px rgba(255,255,255,.35);border-radius:50%;z-index:2147483000;pointer-events:none;transform:translate(-50%,-50%);transition:left .08s linear,top .08s linear}
  #demo-cursor::after{content:'';position:absolute;left:50%;top:50%;width:5px;height:5px;border-radius:50%;background:#A95F32;transform:translate(-50%,-50%)}
  #demo-cursor .ripple{position:absolute;left:50%;top:50%;width:22px;height:22px;border:1.5px solid #A95F32;border-radius:50%;transform:translate(-50%,-50%) scale(.4);opacity:0}
  #demo-cursor.click .ripple{animation:demo-ripple .55s ease-out}
  @keyframes demo-ripple{0%{opacity:.85;transform:translate(-50%,-50%) scale(.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(3.1)}}
  #demo-caption{position:fixed;left:50%;bottom:36px;transform:translateX(-50%) translateY(8px);z-index:2147482990;background:#181410;color:#F7F2E9;border:1px solid rgba(247,242,233,.16);border-radius:999px;padding:12px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;opacity:0;transition:opacity .4s ease,transform .4s ease;white-space:nowrap;box-shadow:0 12px 32px rgba(0,0,0,.18)}
  #demo-caption.show{opacity:1;transform:translateX(-50%) translateY(0)}
  #demo-fade{position:fixed;inset:0;background:#F5EFE4;z-index:2147482980;opacity:0;pointer-events:none;transition:opacity .38s ease}
  #demo-fade.on{opacity:1}
  #demo-outro{position:fixed;inset:0;z-index:2147482999;background:#181410;color:#F7F2E9;display:none;place-items:center;text-align:center;font-family:Georgia,serif}
  #demo-outro.on{display:grid}
  #demo-outro .eyebrow{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:#A95F32}
  #demo-outro .word{font-size:64px;letter-spacing:-.04em;margin-top:14px}
  #demo-outro h2{font-weight:400;font-size:38px;margin:24px 0 0;letter-spacing:-.03em}
  #demo-outro h2 em{color:#A95F32}
  #demo-outro p{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(247,242,233,.5);margin-top:22px}
`;

async function inject(page) {
  await page.evaluate((css) => {
    if (!document.getElementById('demo-style')) {
      const style = document.createElement('style');
      style.id = 'demo-style';
      style.textContent = css;
      document.head.appendChild(style);
    }
    if (!document.getElementById('demo-cursor')) {
      const c = document.createElement('div');
      c.id = 'demo-cursor';
      c.innerHTML = '<span class="ripple"></span>';
      document.body.appendChild(c);
      window.addEventListener('mousemove', (e) => {
        c.style.left = e.clientX + 'px';
        c.style.top = e.clientY + 'px';
      }, { passive: true });
      window.addEventListener('mousedown', () => {
        c.classList.remove('click');
        void c.offsetWidth;
        c.classList.add('click');
      });
      const cap = document.createElement('div');
      cap.id = 'demo-caption';
      document.body.appendChild(cap);
      const fade = document.createElement('div');
      fade.id = 'demo-fade';
      document.body.appendChild(fade);
    }
  }, overlayCss);
}

async function caption(page, text) {
  await inject(page);
  await page.evaluate((t) => {
    const cap = document.getElementById('demo-caption');
    if (!cap) return;
    cap.textContent = t;
    cap.classList.remove('show');
    void cap.offsetWidth;
    cap.classList.add('show');
  }, text);
}

async function fade(page, on = true) {
  await inject(page);
  await page.evaluate((v) => {
    const f = document.getElementById('demo-fade');
    if (f) f.classList.toggle('on', v);
  }, on);
  await wait(420);
}

async function smoothScroll(page, y, duration = 1100) {
  await page.evaluate(({ target, ms }) => new Promise((resolve) => {
    const start = window.scrollY;
    const t0 = performance.now();
    function step(t) {
      const p = Math.min(1, (t - t0) / ms);
      const ease = 1 - Math.pow(1 - p, 3);
      window.scrollTo(0, start + (target - start) * ease);
      if (p < 1) requestAnimationFrame(step); else resolve();
    }
    requestAnimationFrame(step);
  }), { target: y, ms: duration });
}

async function point(page, locator) {
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 14 });
  await page.evaluate(({ x, y }) => {
    const c = document.getElementById('demo-cursor');
    if (c) { c.style.left = x + 'px'; c.style.top = y + 'px'; }
  }, { x, y });
  await wait(350);
}

async function navigate(page, action, { transition = true } = {}) {
  if (transition) await fade(page, true);
  await action();
  await page.waitForLoadState('networkidle').catch(() => {});
  await inject(page);
  await wait(250);
  if (transition) await fade(page, false);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: RAW_DIR, size: { width: 1920, height: 1080 } },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const video = page.video();

  // The intro is installed before the storefront paints, then lifts to reveal the page.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('demo_intro_seen')) return;
    sessionStorage.setItem('demo_intro_seen', '1');
    const mount = () => {
      if (document.getElementById('demo-intro')) return;
      const el = document.createElement('div');
      el.id = 'demo-intro';
      el.innerHTML = `<div style="position:fixed;inset:0;z-index:2147483640;background:#F5EFE4;background-image:radial-gradient(circle at 75% 15%, rgba(169,95,50,.13), transparent 45%),radial-gradient(circle at 15% 85%, rgba(24,20,16,.06), transparent 50%);color:#181410;font-family:Georgia,'Times New Roman',serif;display:grid;place-items:center;text-align:center;transition:opacity .7s ease;opacity:1"><div style="padding:40px"><div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:#A95F32">Pune · India</div><div style="font-size:68px;line-height:1;letter-spacing:-.04em;margin-top:18px">E-Commerce</div><div style="width:52px;height:1px;background:#A95F32;margin:32px auto"></div><div style="font-weight:400;font-size:44px;line-height:1.05;letter-spacing:-.03em">Made to work.<br><em style="color:#A95F32">Made to stay.</em></div><p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#6F6357;margin-top:30px">Machinery · Tools · Handcrafted furniture</p></div></div>`;
      document.body.appendChild(el);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(3600);
  await page.evaluate(() => {
    const intro = document.getElementById('demo-intro');
    if (intro) {
      const layer = intro.firstElementChild;
      if (layer) layer.style.opacity = '0';
      setTimeout(() => intro.remove(), 750);
    }
  });
  await wait(900);
  await inject(page);
  await page.mouse.move(960, 560, { steps: 20 });
  await page.evaluate((token) => {
    try {
      localStorage.clear();
      sessionStorage.setItem('demo_intro_seen', '1');
      localStorage.setItem('tk_admin', token);
    } catch { /* ignore */ }
  }, ADMIN_TOKEN);
  await wait(700);

  await caption(page, '01 · A quieter way to buy');
  await wait(2400);
  await smoothScroll(page, 780, 1400);
  await caption(page, '02 · Curated, not crowded');
  await wait(2400);
  await smoothScroll(page, 1450, 1200);
  await caption(page, '03 · The weekly edit');
  await wait(1800);

  // Category
  await smoothScroll(page, 900, 900);
  const categoryTile = page.locator('section').filter({ hasText: 'Shop by Category' }).locator('a[href="/category/power-tools"]').first();
  await categoryTile.hover();
  await point(page, categoryTile);
  await wait(500);
  await navigate(page, () => categoryTile.click());
  await caption(page, '04 · Every tool chosen by people who use them');
  await wait(2000);
  const firstCard = page.locator('[data-testid="product-card"]').first();
  await firstCard.hover();
  await point(page, firstCard);
  await wait(900);

  // Product
  await navigate(page, () => firstCard.click());
  await smoothScroll(page, 0, 350);
  await wait(700);
  await caption(page, '05 · The details that matter');
  await wait(1800);
  const mainImage = page.locator('main img').first();
  await mainImage.hover();
  await point(page, mainImage);
  await wait(900);
  await smoothScroll(page, 360, 900);
  await wait(1500);
  await smoothScroll(page, 0, 700);
  await wait(500);
  const addButton = page.getByRole('button', { name: /^Add to Cart$/ });
  await addButton.hover();
  await point(page, addButton);
  await addButton.click();
  await wait(700);
  const cartLink = page.getByRole('link', { name: /^Cart/ }).first();
  await cartLink.hover();
  await point(page, cartLink);
  await cartLink.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await inject(page);
  await caption(page, '06 · A cart that keeps it simple');
  await wait(1800);
  const checkoutLink = page.getByRole('link', { name: /Proceed to Checkout/i });
  await checkoutLink.hover();
  await point(page, checkoutLink);
  await checkoutLink.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await inject(page);

  // Checkout
  await caption(page, '07 · Guest checkout. No account required.');
  await wait(1300);
  await page.getByLabel('Full name').fill('Aarav Sharma');
  await page.getByLabel('Phone number').fill('9876501234');
  await page.getByLabel('Email for order updates').fill('aarav.sharma@example.com');
  await page.getByLabel('Delivery address').fill('12 Koregaon Park Lane 5, Pune');
  await page.getByLabel('Pincode').fill('411001');
  await page.getByLabel('Delivery state').selectOption({ label: 'Maharashtra' });
  await page.locator('form label').filter({ hasText: /^COD$/ }).click();
  await wait(800);
  await smoothScroll(page, 520, 700);
  const payButton = page.getByRole('button', { name: /Pay ₹/ });
  await payButton.hover();
  await point(page, payButton);
  await payButton.click();
  await page.waitForURL(/order-success/, { timeout: 15000 });
  const receipt = new URL(page.url()).searchParams.get('receipt') || '';
  await page.evaluate((r) => { try { localStorage.setItem('tw_demo_receipt', r); } catch { /* ignore */ } }, receipt);
  await page.waitForLoadState('networkidle').catch(() => {});
  await inject(page);
  await caption(page, '08 · A GST invoice, ready on order');
  await wait(2200);
  await page.getByRole('link', { name: /GST Invoice/i }).click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await inject(page);
  await wait(1000);
  await smoothScroll(page, 320, 800);
  await caption(page, '09 · Tax-ready, every time');
  await wait(1800);

  // Brands
  await navigate(page, () => page.goto(`${BASE}/brands`, { waitUntil: 'domcontentloaded' }));
  await caption(page, '10 · Brands we stand behind');
  await wait(1800);
  const brandSearch = page.getByLabel('Search brands');
  await brandSearch.click();
  await point(page, brandSearch);
  await page.getByLabel('Search brands').pressSequentially('Grace', { delay: 110 });
  await wait(1500);

  // Admin overview (no customer names on screen)
  await navigate(page, () => page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' }));
  await caption(page, '11 · One console for the whole operation');
  await wait(2400);
  await smoothScroll(page, 260, 800);
  await wait(2200);

  // People / close
  await navigate(page, () => page.goto(`${BASE}/#people`, { waitUntil: 'domcontentloaded' }));
  await wait(900);
  const peopleY = await page.evaluate(() => document.getElementById('people')?.getBoundingClientRect().top + window.scrollY - 90 || 0);
  await smoothScroll(page, peopleY + 120, 1300);
  await wait(1200);
  await caption(page, '12 · The people behind your order');
  await wait(2200);
  await fade(page, true);
  await page.evaluate((token) => {
    // no-op: outro is added below
    void token;
  }, ADMIN_TOKEN);
  await page.evaluate(() => {
    const o = document.createElement('div');
    o.id = 'demo-outro';
    o.innerHTML = `<div><div class="eyebrow">E-Commerce · Pune</div><div class="word">E-Commerce</div><h2>Made to work.<br><em>Made to stay.</em></h2><p>Machinery · Tools · Handcrafted furniture</p></div>`;
    document.body.appendChild(o);
    void o.offsetWidth;
    o.classList.add('on');
  });
  await wait(3800);

  await context.close();
  const raw = await video.path();
  const mp4 = path.join(OUT_DIR, 'ecommerce-demo.mp4');
  execFileSync('ffmpeg', ['-y', '-i', raw, '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], { stdio: 'inherit' });
  execFileSync('ffmpeg', ['-y', '-ss', '1', '-i', mp4, '-frames:v', '1', '-q:v', '2', path.join(OUT_DIR, 'poster.jpg')], { stdio: 'inherit' });
  console.log('VIDEO', mp4);
}

main().catch((err) => { console.error(err); process.exit(1); });

function sanitizeItem(i) {
  if (!i || typeof i !== 'object') return null;
  const slug = i.slug || i.id;
  if (!slug) return null;
  const qty = Math.max(0, parseInt(i.qty, 10) || 0);
  const price = Number(i.price);
  return {
    slug,
    name: i.name || slug,
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    image: i.image || (i.images && i.images[0]) || '',
    qty,
  };
}

export function getCart() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem('toolskart_cart') || '[]');
    if (!Array.isArray(raw)) return [];
    // Self-heal: drop corrupt/legacy entries (missing slug, NaN price) so one bad
    // item can never turn every total on the site into NaN.
    return raw.map(sanitizeItem).filter((i) => i && i.qty > 0);
  } catch {
    return [];
  }
}

export function saveCart(items) {
  localStorage.setItem('toolskart_cart', JSON.stringify(items));
  window.dispatchEvent(new Event('cart-updated'));
}

export function addToCart(product, qty = 1) {
  const items = getCart();
  const id = product.slug || product.id;
  if (!id) return items;
  const n = Math.max(1, parseInt(qty, 10) || 1);
  const found = items.find((i) => i.slug === id);
  if (found) {
    found.qty = Math.min(99, found.qty + n);
  } else {
    const price = Number(product.price);
    items.push({
      slug: id,
      name: product.name || id,
      price: Number.isFinite(price) && price >= 0 ? price : 0,
      image: product.image || (product.images && product.images[0]) || '',
      qty: Math.min(99, n)
    });
  }
  saveCart(items);
  return items;
}

export const cartAdd = addToCart;

export function updateQty(slug, qty) {
  const n = Math.max(0, parseInt(qty, 10) || 0);
  let items = getCart();
  if (n <= 0) items = items.filter((i) => i.slug !== slug);
  else items = items.map((i) => (i.slug === slug ? { ...i, qty: Math.min(99, n) } : i));
  saveCart(items);
  return items;
}

export function removeItem(slug) {
  const items = getCart().filter((i) => i.slug !== slug);
  saveCart(items);
  return items;
}

export function clearCart() {
  saveCart([]);
}

export function cartTotal(items) {
  const list = items || getCart();
  return list.reduce((s, i) => {
    const p = Number(i && i.price);
    const q = Number(i && i.qty);
    if (!Number.isFinite(p) || !Number.isFinite(q) || p < 0 || q <= 0) return s;
    return s + p * q;
  }, 0);
}

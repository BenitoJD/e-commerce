export function getCart() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('toolskart_cart') || '[]');
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
  const found = items.find((i) => i.slug === id);
  if (found) {
    found.qty += qty;
  } else {
    items.push({
      slug: id,
      name: product.name,
      price: Number(product.price),
      image: product.image || (product.images && product.images[0]) || '',
      qty
    });
  }
  saveCart(items);
  return items;
}

export const cartAdd = addToCart;

export function updateQty(slug, qty) {
  let items = getCart();
  if (qty <= 0) items = items.filter((i) => i.slug !== slug);
  else items = items.map((i) => (i.slug === slug ? { ...i, qty } : i));
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
  return list.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
}

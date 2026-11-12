function sanitizeWish(i) {
  if (!i || typeof i !== 'object') return null;
  const slug = i.slug || i.id;
  if (!slug) return null;
  const price = Number(i.price);
  const stock = i.stock == null ? null : Number(i.stock);
  return {
    slug,
    name: i.name || slug,
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    brand: i.brand || '',
    image: i.image || (i.images && i.images[0]) || '',
    stock: stock == null || !Number.isFinite(stock) ? null : Math.max(0, Math.floor(stock)),
  };
}

export function getWishlist() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem('tw_wishlist') || '[]');
    if (!Array.isArray(raw)) return [];
    // Self-heal: drop corrupt/legacy entries so one bad item never breaks the page.
    return raw.map(sanitizeWish).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveWishlist(items) {
  localStorage.setItem('tw_wishlist', JSON.stringify(items));
  window.dispatchEvent(new Event('wishlist-updated'));
}

export function addToWishlist(product) {
  const items = getWishlist();
  const slug = product.slug || product.id;
  if (!slug) return items;
  const found = items.find((i) => i.slug === slug);
  if (!found) {
    const price = Number(product.price);
    const stock = product.stock == null ? null : Number(product.stock);
    items.push({
      slug,
      name: product.name || slug,
      price: Number.isFinite(price) && price >= 0 ? price : 0,
      brand: product.brand || '',
      image: product.image || (product.images && product.images[0]) || '',
      stock: stock == null || !Number.isFinite(stock) ? null : Math.max(0, Math.floor(stock)),
    });
    saveWishlist(items);
  }
  return items;
}

export function removeFromWishlist(slug) {
  const items = getWishlist().filter((i) => i.slug !== slug);
  saveWishlist(items);
  return items;
}

export function isWishlisted(slug) {
  if (typeof window === 'undefined') return false;
  return getWishlist().some((i) => i.slug === slug);
}

export function clearWishlist() {
  saveWishlist([]);
}

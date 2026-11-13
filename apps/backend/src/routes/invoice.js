const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /store/invoice/:receipt
router.get('/:receipt', async (req, res) => {
  try {
    const receipt = String(req.params.receipt || '').trim();
    if (!receipt) return res.status(400).json({ error: 'receipt required' });
    const { rows } = await db.query(
      `SELECT receipt, status, items, amount_paise, razorpay_payment_id, customer, created_at,
              coupon_code, COALESCE(discount_paise, 0) AS discount_paise, pay_mode,
              COALESCE(shipping_paise, 0) AS shipping_paise
       FROM orders WHERE receipt = $1`,
      [receipt]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    const order = rows[0];
    const orderItems = Array.isArray(order.items) ? order.items : [];

    const slugs = [...new Set(orderItems.map((it) => it && it.slug).filter(Boolean))];
    let bySlug = {};
    if (slugs.length) {
      const { rows: found } = await db.query(
        'SELECT slug, name, hsn, price_paise FROM products WHERE slug = ANY($1)',
        [slugs]
      );
      bySlug = Object.fromEntries(found.map((p) => [p.slug, p]));
    }

    const items = orderItems.map((it) => {
      const p = bySlug[it.slug] || {};
      const qty = parseInt(it.qty, 10) || 0;
      const unitPaise = it.unit_price_paise != null ? it.unit_price_paise : p.price_paise || 0;
      return {
        slug: it.slug,
        name: p.name || it.slug,
        hsn: p.hsn || '',
        qty,
        unitPaise,
        linePaise: unitPaise * qty,
      };
    });

    const grandPaise = order.amount_paise;
    const base = Math.round((grandPaise * 100) / 118);
    const gst = grandPaise - base;
    const customer = order.customer || {};
    const itemsTotalPaise = items.reduce((s, it) => s + (it.linePaise || 0), 0);
    const discountPaise = Number(order.discount_paise) || 0;
    const shippingPaise = Number(order.shipping_paise) || 0;

    res.json({
      receipt: order.receipt,
      createdAt: order.created_at,
      status: order.status,
      couponCode: order.coupon_code || null,
      payMode: order.pay_mode || (String(order.status) === 'cod_pending' ? 'cod' : 'online'),
      discountPaise,
      itemsTotalPaise,
      shippingPaise,
      customer: {
        name: customer.name || '',
        phone: customer.phone || '',
        address: customer.address || '',
        pincode: customer.pincode || '',
        gstin: customer.gstin || '',
        // Needed for the invoice's place of supply (CGST+SGST vs IGST) on B2C orders.
        state: customer.state || '',
        stateCode: customer.stateCode || customer.state_code || '',
      },
      items,
      subtotalPaise: grandPaise,
      gst: { rate: 18, base, gst },
      grandPaise,
      razorpayPaymentId: order.razorpay_payment_id || null,
    });
  } catch (err) {
    console.error('[invoice] error:', err.message);
    res.status(500).json({ error: 'Invoice failed' });
  }
});

module.exports = router;

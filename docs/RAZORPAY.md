# Razorpay integration (UPI + Cards + EMI + COD)

## 1. Dashboard setup
1. Create account https://razorpay.com → complete KYC → add settlement bank.
2. Settings → API Keys → generate Test + Live keys.
3. Products → enable: Payment Gateway (UPI/Cards/Netbanking), EMI + Cardless EMI, Payment Links, Refunds. If marketplace: Route.
4. Webhooks → Add: `https://yourdomain.com/api/webhooks/razorpay`, secret `whsec_...`, events: payment.captured, payment.failed, refund.processed.

## 2. Backend env
```
RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=xxxx
RAZORPAY_WEBHOOK_SECRET=whsec_xxxx
```

## 3. Flow
- `POST /store/checkout/create` {items, customer, payMode} → creates `orders` row (pending) + Razorpay order (`orders.create`). Returns `razorpayOrderId`.
- Frontend `checkout.js` opens with `order_id` + key. User pays UPI/Card/EMI.
- Razorpay → `POST /webhooks/razorpay` (raw body, HMAC verify) → `payment.captured` marks paid.
- COD: `payMode:'cod'` skips Razorpay, order `cod_pending`.

## 4. Test
- Use test key + UPI test `success@razorpay`, card `4111 1111 1111 1111`.
- Check backend logs: `payment.captured → order <receipt> paid`.
- Test webhook locally: `curl -X POST localhost:9000/webhooks/razorpay -H "Content-Type: application/json" -d '{"test":1}'` → expect 400 invalid signature (proves verify works).

## 5. Go-live
Switch to `rzp_live_*`, update webhook URL to live domain, test ₹10 real UPI, test refund, confirm T+2 settlement + GST invoice prints payment ID.

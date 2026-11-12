export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Privacy Policy</h1>
      <div className="card p-6 mt-5 space-y-3 text-sm text-gray-700">
        <p>We collect only what an order needs: name, phone, address, pincode, and order history. Payment details are processed directly by Razorpay — we never store card/UPI credentials.</p>
        <p><b>Use:</b> Delivery, GST invoicing, warranty support, fraud prevention and (only if you opt in) offers via email/SMS.</p>
        <p><b>Sharing:</b> With delivery partners, Razorpay and tax authorities as legally required. We never sell your data.</p>
        <p><b>Cookies/local storage:</b> Cart, wishlist and recently-viewed items stay in your browser (keys toolskart_cart, tw_wishlist, tw_recent, tw_coupon).</p>
        <p><b>Your rights:</b> Ask for export or deletion anytime at care@toolskart.in. Marketing opt-out is one click in any email.</p>
      </div>
    </div>
  );
}

// SMS delivery for guest OTP codes.
//
// Twilio's REST API is implemented directly (no SDK): it is the smallest honest adapter
// for an Indian store that wants real phone verification without a vendor SDK. When it is
// not configured, the OTP endpoint stays in development mode (code in the response) or
// refuses in production, it never claims a message was sent when it wasn't.
function smsConfigured(env = process.env) {
  return String(env.SMS_PROVIDER || '').toLowerCase() === 'twilio'
    && Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);
}

function normalizeTo(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return digits ? `+${digits}` : '';
}

async function sendSms(phone, body, { env = process.env, fetchImpl = fetch } = {}) {
  if (!smsConfigured(env)) return { sent: false, reason: 'SMS is not configured' };
  const to = normalizeTo(phone);
  if (!to) return { sent: false, reason: 'invalid phone' };
  const sid = env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const form = new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: String(body || '').slice(0, 600) });
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { sent: false, reason: `gateway ${res.status}: ${detail.slice(0, 200)}` };
    }
    const json = await res.json().catch(() => ({}));
    return { sent: true, id: json.sid || null };
  } catch (err) {
    return { sent: false, reason: err.message || 'network error' };
  }
}

module.exports = { smsConfigured, sendSms, normalizeTo };

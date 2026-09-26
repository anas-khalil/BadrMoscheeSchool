type Env = {
  RESEND_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  ADMIN_UIDS: string;
  ALLOWED_ORIGIN: string;
};

type NotificationRequest = {
  type: 'parent-approved';
  recipientEmail: string;
  recipientName: string;
  locale?: 'en' | 'de' | 'ar';
};

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function response(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, 'Access-Control-Allow-Origin': origin }
  });
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value))) as T;
}

async function verifyFirebaseIdToken(token: string, env: Env): Promise<{ uid: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const header = decodeJson<{ kid?: string; alg?: string }>(parts[0]);
  const payload = decodeJson<{ user_id?: string; sub?: string; aud?: string; iss?: string; exp?: number }>(parts[1]);
  if (header.alg !== 'RS256' || !header.kid || !payload.sub || payload.sub !== payload.user_id) return null;
  if (payload.aud !== env.FIREBASE_PROJECT_ID) return null;
  if (payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) return null;
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;

  const jwkResponse = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!jwkResponse.ok) return null;
  const jwks = await jwkResponse.json<{ keys: JsonWebKey[] }>();
  const key = jwks.keys.find((candidate) => (candidate as JsonWebKey & { kid?: string }).kid === header.kid);
  if (!key) return null;

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    key,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );

  return valid ? { uid: payload.sub } : null;
}

function emailCopy(locale: 'en' | 'de' | 'ar', recipientName: string) {
  if (locale === 'de') {
    return {
      subject: 'Ihr Badr Moschee Schule Konto wurde freigeschaltet',
      heading: 'Ihr Konto wurde freigeschaltet',
      body: `Hallo ${recipientName}, Ihr Konto für die Badr Moschee Schule wurde von der Schulverwaltung genehmigt. Sie können sich jetzt auf der Schulwebsite anmelden.`,
      button: 'Schulwebsite öffnen'
    };
  }
  if (locale === 'ar') {
    return {
      subject: 'تمت الموافقة على حسابك في المدرسة العربية بمسجد بدر',
      heading: 'تمت الموافقة على حسابك',
      body: `مرحباً ${recipientName}، تمت الموافقة على حسابك في المدرسة العربية بمسجد بدر من قِبل إدارة المدرسة. يمكنك الآن تسجيل الدخول إلى موقع المدرسة.`,
      button: 'فتح موقع المدرسة'
    };
  }
  return {
    subject: 'Your Badr Mosque School account has been approved',
    heading: 'Your account has been approved',
    body: `Hello ${recipientName}, your Badr Mosque School account has been approved by the school administration. You can now sign in to the school website.`,
    button: 'Open school website'
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN || '*';
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...jsonHeaders, 'Access-Control-Allow-Origin': origin } });
    if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405, origin);

    const authorization = request.headers.get('Authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const identity = token ? await verifyFirebaseIdToken(token, env).catch(() => null) : null;
    if (!identity) return response({ error: 'Unauthorized' }, 401, origin);

    const adminUids = env.ADMIN_UIDS.split(',').map((uid) => uid.trim()).filter(Boolean);
    if (!adminUids.includes(identity.uid)) return response({ error: 'Forbidden' }, 403, origin);

    const payload = await request.json<NotificationRequest>().catch(() => null);
    if (!payload || payload.type !== 'parent-approved' || !payload.recipientEmail || !payload.recipientName) {
      return response({ error: 'Invalid request' }, 400, origin);
    }

    const locale = payload.locale || 'en';
    const copy = emailCopy(locale, payload.recipientName);
    const websiteUrl = 'https://badrschule.com';
    const html = `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><body style="font-family:Arial,sans-serif;line-height:1.6;max-width:640px;margin:40px auto;padding:24px"><h2>${copy.heading}</h2><p>${copy.body}</p><p><a href="${websiteUrl}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:8px">${copy.button}</a></p><p style="color:#666;font-size:13px">Badr Mosque School · Aschaffenburg</p></body></html>`;
    const text = `${copy.heading}\n\n${copy.body}\n\n${websiteUrl}`;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Badr Mosque School <admin@badrschule.com>',
        reply_to: 'admin@badrschule.com',
        to: [payload.recipientEmail],
        subject: copy.subject,
        html,
        text
      })
    });

    if (!resendResponse.ok) {
      const details = await resendResponse.text();
      console.error('Resend error:', details);
      return response({ error: 'Email delivery failed' }, 502, origin);
    }

    return response({ ok: true }, 200, origin);
  }
};

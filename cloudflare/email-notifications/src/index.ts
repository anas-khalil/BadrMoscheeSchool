type Env = {
  RESEND_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  ADMIN_UIDS: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  ALLOWED_ORIGIN: string;
};

type FsValue = { stringValue?: string; booleanValue?: boolean; integerValue?: string; timestampValue?: string; arrayValue?: { values?: FsValue[] } };
type FsDoc = { name: string; fields?: Record<string, FsValue> };

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function response(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, 'Access-Control-Allow-Origin': origin } });
}

function b64url(bytes: Uint8Array) {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function unb64(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function jsonPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(unb64(value))) as T;
}

function str(doc: FsDoc | undefined, key: string) {
  return doc?.fields?.[key]?.stringValue;
}

function docId(doc: FsDoc) {
  return doc.name.split('/').pop() || '';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

async function googleToken(env: Env) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as { client_email: string; private_key: string };
  const clean = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(clean), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const body = b64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + body));
  const assertion = head + '.' + body + '.' + b64url(new Uint8Array(signature));
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  if (!tokenResponse.ok) throw new Error('Google OAuth token request failed');
  return (await tokenResponse.json() as { access_token: string }).access_token;
}

async function firestore(env: Env, path: string, init?: RequestInit) {
  const token = await googleToken(env);
  const response = await fetch('https://firestore.googleapis.com/v1/projects/' + env.FIREBASE_PROJECT_ID + '/databases/(default)/documents/' + path, {
    ...(init || {}),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...((init || {}).headers || {}) }
  });
  if (!response.ok) throw new Error('Firestore request failed: ' + response.status);
  return response;
}

async function listCollection(env: Env, collection: string) {
  const response = await firestore(env, collection + '?pageSize=100');
  return (await response.json() as { documents?: FsDoc[] }).documents || [];
}

async function getDoc(env: Env, collection: string, id: string) {
  try {
    const response = await firestore(env, collection + '/' + encodeURIComponent(id));
    return await response.json() as FsDoc;
  } catch {
    return null;
  }
}

async function removeDoc(env: Env, name: string) {
  const token = await googleToken(env);
  await fetch('https://firestore.googleapis.com/v1/' + name, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
}

function emailCopy(locale: 'en' | 'de' | 'ar', type: string, name: string, details: string) {
  const subjects: Record<'en' | 'de' | 'ar', Record<string, string>> = {
    en: {
      'parent-approved': 'Your Badr Mosque School account has been approved',
      'teacher-approved': 'Your Badr Mosque School teacher account has been approved',
      'student-level-assigned': 'Your child has been assigned a school level',
      'student-group-assigned': 'Your child has been assigned to a group',
      'teacher-group-assigned': 'You have been assigned to a group',
      'teacher-group-removed': 'You have been removed from a group',
      'assignment-parent': 'A new assignment was given to your child',
      'calendar-announcement': 'New school announcement',
      'message': 'You have new messages',
      'new-registration': 'New registration awaiting approval'
    },
    de: {
      'parent-approved': 'Ihr Konto bei der Badr Moschee Schule wurde genehmigt',
      'teacher-approved': 'Ihr Lehrerkonto bei der Badr Moschee Schule wurde genehmigt',
      'student-level-assigned': 'Das Niveau Ihres Kindes wurde festgelegt',
      'student-group-assigned': 'Ihr Kind wurde einer Lerngruppe zugewiesen',
      'teacher-group-assigned': 'Sie wurden einer Lerngruppe zugewiesen',
      'teacher-group-removed': 'Sie wurden aus einer Lerngruppe entfernt',
      'assignment-parent': 'Eine neue Aufgabe wurde Ihrem Kind zugewiesen',
      'calendar-announcement': 'Neue Schulankündigung',
      'message': 'Sie haben neue Nachrichten',
      'new-registration': 'Neue Registrierung wartet auf Genehmigung'
    },
    ar: {
      'parent-approved': 'تمت الموافقة على حسابك في المدرسة العربية بمسجد بدر',
      'teacher-approved': 'تمت الموافقة على حساب المعلم في المدرسة العربية بمسجد بدر',
      'student-level-assigned': 'تم تحديد مستوى طفلك في المدرسة العربية بمسجد بدر',
      'student-group-assigned': 'تم تسجيل طفلك في مجموعة دراسية',
      'teacher-group-assigned': 'تم تعيينك في مجموعة دراسية',
      'teacher-group-removed': 'تمت إزالتك من مجموعة دراسية',
      'assignment-parent': 'تم إسناد واجب جديد لطفلك',
      'calendar-announcement': 'إعلان جديد من المدرسة',
      'message': 'لديك رسائل جديدة',
      'new-registration': 'تسجيل جديد يحتاج إلى موافقة'
    }
  };
  const greeting = locale === 'ar' ? 'مرحباً ' : locale === 'de' ? 'Hallo ' : 'Hello ';
  return {
    subject: subjects[locale][type] || 'Badr Mosque School notification',
    body: greeting + name + ',\n\n' + details + '\n\nBadr Mosque School'
  };
}

async function sendEmail(env: Env, email: string, name: string, locale: 'en' | 'de' | 'ar', type: string, details: string) {
  const copy = emailCopy(locale, type, name, details);
  const html = '<!doctype html><html lang="' + locale + '" dir="' + (locale === 'ar' ? 'rtl' : 'ltr') + '"><body style="font-family:Arial,sans-serif;line-height:1.6;max-width:640px;margin:40px auto;padding:24px"><h2>' +
    escapeHtml(copy.subject) + '</h2><p>' + escapeHtml(copy.body).replace(/\n/g, '<br>') +
    '</p><p><a href="https://badrschule.com">Badr Mosque School</a></p></body></html>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Badr Mosque School <admin@badrschule.com>',
      reply_to: 'admin@badrschule.com',
      to: [email],
      subject: copy.subject,
      html,
      text: copy.body
    })
  });
  if (!response.ok) throw new Error(await response.text());
}

async function processQueue(env: Env) {
  const [notifications, userDocs] = await Promise.all([
    listCollection(env, 'emailNotifications'),
    listCollection(env, 'users')
  ]);
  const users = new Map(userDocs.map((doc) => [docId(doc), doc]));
  const now = Date.now();
  const pending = notifications.filter((doc) => {
    const sendAfter = str(doc, 'sendAfter');
    return !sendAfter || new Date(sendAfter).getTime() <= now;
  }).slice(0, 100);

  const messages = new Map<string, FsDoc[]>();
  for (const notification of pending.filter((doc) => str(doc, 'type') === 'message')) {
    const target = str(notification, 'targetUserId') || '';
    if (!messages.has(target)) messages.set(target, []);
    messages.get(target)!.push(notification);
  }

  for (const [targetId, batch] of messages) {
    try {
      const target = users.get(targetId);
      const email = str(target, 'email');
      if (!email) throw new Error('Message target has no email');
      const name = str(target, 'name') || email;
      const locale = (str(target, 'language') || 'en') as 'en' | 'de' | 'ar';
      const parts: string[] = [];
      for (const item of batch) {
        const message = str(item, 'messageId') ? await getDoc(env, 'messages', str(item, 'messageId')!) : null;
        if (message) parts.push((str(message, 'senderName') || 'School') + ': ' + (str(message, 'text') || ''));
      }
      if (parts.length) await sendEmail(env, email, name, locale, 'message', parts.join('\n\n'));
      for (const item of batch) await removeDoc(env, item.name);
    } catch (error) {
      console.error('Message notification failed', error);
    }
  }

  for (const notification of pending.filter((doc) => str(doc, 'type') !== 'message')) {
    try {
      const type = str(notification, 'type') || '';
      const targetId = str(notification, 'targetUserId');
      if (type === 'calendar-announcement') {
        const event = str(notification, 'eventId') ? await getDoc(env, 'calendarEvents', str(notification, 'eventId')!) : null;
        const title = str(event || undefined, 'title') || 'School event';
        const date = str(event || undefined, 'date') || '';
        for (const target of users.values()) {
          const email = str(target, 'email');
          if (!email || str(target, 'status') !== 'active') continue;
          const name = str(target, 'name') || email;
          const locale = (str(target, 'language') || 'en') as 'en' | 'de' | 'ar';
          const details = locale === 'ar' ? 'فعالية جديدة: ' + title + (date ? '\nالتاريخ: ' + date : '') : locale === 'de' ? 'Neue Veranstaltung: ' + title + (date ? '\nDatum: ' + date : '') : 'New event: ' + title + (date ? '\nDate: ' + date : '');
          await sendEmail(env, email, name, locale, type, details);
        }
      } else if (type === 'new-registration') {
        const actor = users.get(str(notification, 'actorUserId') || '');
        const actorName = str(actor, 'name') || 'New user';
        const actorEmail = str(actor, 'email') || '';
        const actorRole = str(notification, 'actorRole') || str(actor, 'role') || 'user';
        for (const target of users.values()) {
          if (str(target, 'role') !== 'admin' || str(target, 'status') !== 'active') continue;
          const email = str(target, 'email');
          if (!email) continue;
          const name = str(target, 'name') || email;
          const locale = (str(target, 'language') || 'en') as 'en' | 'de' | 'ar';
          const details = locale === 'ar' ? 'يوجد تسجيل جديد يحتاج إلى الموافقة.\nالاسم: ' + actorName + '\nالبريد: ' + actorEmail + '\nالنوع: ' + actorRole : locale === 'de' ? 'Eine neue Registrierung wartet auf Ihre Genehmigung.\nName: ' + actorName + '\nE-Mail: ' + actorEmail + '\nTyp: ' + actorRole : 'A new registration is waiting for approval.\nName: ' + actorName + '\nEmail: ' + actorEmail + '\nRole: ' + actorRole;
          await sendEmail(env, email, name, locale, type, details);
        }
      } else if (targetId) {
        const target = users.get(targetId);
        const email = str(target, 'email');
        if (!email) throw new Error('Notification target has no email');
        const name = str(target, 'name') || email;
        const locale = (str(target, 'language') || 'en') as 'en' | 'de' | 'ar';
        let details = '';
        if (type === 'parent-approved') details = locale === 'ar' ? 'تمت الموافقة على حسابك ويمكنك الآن تسجيل الدخول.' : locale === 'de' ? 'Ihr Konto wurde genehmigt. Sie können sich jetzt anmelden.' : 'Your account has been approved. You can now sign in.';
        if (type === 'teacher-approved') details = locale === 'ar' ? 'تمت الموافقة على حساب المعلم ويمكنك الآن تسجيل الدخول.' : locale === 'de' ? 'Ihr Lehrerkonto wurde genehmigt. Sie können sich jetzt anmelden.' : 'Your teacher account has been approved. You can now sign in.';
        if (type === 'student-level-assigned') details = 'Subject: ' + (str(notification, 'subject') || '') + '\nLevel: ' + (str(notification, 'level') || '');
        if (type === 'student-group-assigned') details = 'Group: ' + (str(notification, 'groupId') || '');
        if (type === 'teacher-group-assigned') details = 'You have been assigned to group ' + (str(notification, 'groupId') || '') + '.';
        if (type === 'teacher-group-removed') details = 'You have been removed from group ' + (str(notification, 'groupId') || '') + '.';
        if (type === 'assignment-parent') {
          const assignment = str(notification, 'assignmentId') ? await getDoc(env, 'assignments', str(notification, 'assignmentId')!) : null;
          const student = str(notification, 'studentId') ? await getDoc(env, 'students', str(notification, 'studentId')!) : null;
          details = 'Child: ' + (str(student || undefined, 'name') || '') + '\nAssignment: ' + (str(assignment || undefined, 'title') || '') + '\nDescription: ' + (str(assignment || undefined, 'description') || '') + '\nDue date: ' + (str(assignment || undefined, 'dueDate') || '');
        }
        await sendEmail(env, email, name, locale, type, details);
      }
      await removeDoc(env, notification.name);
    } catch (error) {
      console.error('Notification failed', error);
    }
  }
}

function base64TokenParts(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  return { header: jsonPart<{ kid?: string; alg?: string }>(parts[0]), payload: jsonPart<{ user_id?: string; sub?: string; aud?: string; iss?: string; exp?: number }>(parts[1]), parts };
}

async function verifyFirebaseIdToken(token: string, env: Env) {
  const parsed = base64TokenParts(token);
  if (!parsed || parsed.header.alg !== 'RS256' || !parsed.header.kid || !parsed.payload.sub || parsed.payload.sub !== parsed.payload.user_id || parsed.payload.aud !== env.FIREBASE_PROJECT_ID || parsed.payload.iss !== 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID || !parsed.payload.exp || parsed.payload.exp <= Math.floor(Date.now() / 1000)) return null;
  const jwkResponse = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!jwkResponse.ok) return null;
  const jwks = await jwkResponse.json() as { keys: JsonWebKey[] };
  const key = jwks.keys.find((item) => (item as JsonWebKey & { kid?: string }).kid === parsed.header.kid);
  if (!key) return null;
  const cryptoKey = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, unb64(parsed.parts[2]), new TextEncoder().encode(parsed.parts[0] + '.' + parsed.parts[1]));
  return valid ? parsed.payload.sub : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN || '*';
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...jsonHeaders, 'Access-Control-Allow-Origin': origin } });
    if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405, origin);
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    const uid = token ? await verifyFirebaseIdToken(token, env).catch(() => null) : null;
    if (!uid || !env.ADMIN_UIDS.split(',').map((x) => x.trim()).includes(uid)) return response({ error: 'Forbidden' }, 403, origin);
    const payload = await request.json() as { type?: string; recipientEmail?: string; recipientName?: string; locale?: 'en' | 'de' | 'ar' };
    if (payload.type !== 'parent-approved' || !payload.recipientEmail || !payload.recipientName) return response({ error: 'Invalid request' }, 400, origin);
    await sendEmail(env, payload.recipientEmail, payload.recipientName, payload.locale || 'en', 'parent-approved', payload.locale === 'ar' ? 'تمت الموافقة على حسابك ويمكنك الآن تسجيل الدخول.' : payload.locale === 'de' ? 'Ihr Konto wurde genehmigt. Sie können sich jetzt anmelden.' : 'Your account has been approved. You can now sign in.');
    return response({ ok: true }, 200, origin);
  },

  async scheduled(_controller: ScheduledController, env: Env) {
    await processQueue(env);
  }
};

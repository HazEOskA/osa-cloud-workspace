import { OAuth2Client } from 'google-auth-library';

const oauthClient = new OAuth2Client();

type AdminAuthResult =
  | { ok: true; email: string }
  | { ok: false; status: number; error: string };

export async function requireAdminIdentity(request: Request): Promise<AdminAuthResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const adminEmail = process.env.OSA_ADMIN_EMAIL?.trim().toLowerCase();

  if (!clientId || !adminEmail) {
    return {
      ok: false,
      status: 503,
      error: 'Brak GOOGLE_CLIENT_ID lub OSA_ADMIN_EMAIL w konfiguracji Cloud Run.',
    };
  }

  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 401, error: 'Zaloguj się kontem administratora Google.' };
  }

  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: match[1],
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();

    if (!email || payload?.email_verified !== true || email !== adminEmail) {
      return { ok: false, status: 403, error: 'To konto Google nie ma uprawnień administratora.' };
    }

    return { ok: true, email };
  } catch {
    return { ok: false, status: 401, error: 'Sesja Google jest nieważna lub wygasła. Zaloguj się ponownie.' };
  }
}

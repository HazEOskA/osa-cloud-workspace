import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const configured = Boolean(clientId && process.env.OSA_ADMIN_EMAIL?.trim());

  return NextResponse.json({
    configured,
    clientId: clientId ?? null,
  });
}

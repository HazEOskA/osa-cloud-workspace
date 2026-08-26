import type { Metadata } from 'next';
import './globals.css';
import './inventory.css';

export const metadata: Metadata = {
  title: 'OSA Cloud Workspace',
  description: 'Prywatna sterownia Google Cloud',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>
        <a
          href="/deploy"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: 1000,
            padding: '11px 15px',
            borderRadius: 12,
            background: '#78d6b0',
            color: '#07110d',
            fontWeight: 800,
            textDecoration: 'none',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.35)',
          }}
        >
          ⇧ Szybki deploy
        </a>
        {children}
      </body>
    </html>
  );
}

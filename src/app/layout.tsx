import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OSA Cloud Workspace',
  description: 'Prywatna sterownia Google Cloud',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}

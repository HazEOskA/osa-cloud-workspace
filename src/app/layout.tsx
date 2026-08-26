import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OSA Cloud Workspace',
  description: 'OSA operations control plane for agents, automations, projects, testing and Google Cloud.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#06070a',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}

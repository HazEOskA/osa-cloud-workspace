import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OSA Cloud Workspace',
  description: 'OSA operations control plane for agents, automations, projects, testing, Gemini Cloud Assist and Google Cloud.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#06070a',
};

const architectDockStyle: React.CSSProperties = {
  position: 'fixed',
  right: 14,
  bottom: 14,
  zIndex: 80,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 13px',
  border: '1px solid #31543e',
  borderRadius: 999,
  background: 'rgba(8, 18, 12, 0.94)',
  color: '#79ffa7',
  textDecoration: 'none',
  font: '800 10px ui-monospace, SFMono-Regular, Menlo, monospace',
  letterSpacing: '0.08em',
  boxShadow: '0 12px 38px rgba(0, 0, 0, 0.38), 0 0 28px rgba(76, 255, 152, 0.08)',
  backdropFilter: 'blur(12px)',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>
        {children}
        <a href="/architect" style={architectDockStyle} aria-label="Otwórz OSA Cloud Architect">
          <span aria-hidden="true">✦</span> CLOUD ARCHITECT
        </a>
      </body>
    </html>
  );
}

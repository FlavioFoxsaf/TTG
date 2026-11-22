import './globals.css';

export const metadata = { title: 'NotaTTG', description: 'Avaliação da Trilha Técnico-Gestora · SENAI CIMATEC' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Aba ativa: a informada pela página ou, se não houver, a que corresponde ao caminho atual
export function Abas({ itens, ativa }: { itens: { href: string; rotulo: string }[]; ativa?: string }) {
  const caminho = usePathname();
  return (
    <nav className="abas">
      {itens.map((i) => (
        <Link key={i.href} href={i.href} className={(ativa ?? caminho) === i.href ? 'ativa' : ''}>
          {i.rotulo}
        </Link>
      ))}
    </nav>
  );
}

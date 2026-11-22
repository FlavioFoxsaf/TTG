import { exigirPerfil } from '@/lib/auth';
import { cicloAtivo, nomeCiclo } from '@/lib/dados';
import { Abas } from '@/components/Abas';
import { Cabecalho } from '@/components/Cabecalho';

const ABAS = [
  { href: '/coordenacao/estudantes', rotulo: 'Estudantes' },
  { href: '/coordenacao/equipes', rotulo: 'Equipes' },
  { href: '/coordenacao/configuracao', rotulo: 'Configuração' },
  { href: '/coordenacao/resultados', rotulo: 'Resultados' },
  { href: '/coordenacao/historico', rotulo: 'Histórico' },
];

export default async function LayoutCoordenacao({ children }: { children: React.ReactNode }) {
  await exigirPerfil('coordenacao');
  const ciclo = await cicloAtivo();
  return (
    <>
      <Cabecalho subtitulo={ciclo ? nomeCiclo(ciclo) : 'Nenhum ciclo ativo'} usuario="Coordenação do TTG" />
      <main className="conteudo">
        <Abas itens={ABAS} />
        {children}
      </main>
    </>
  );
}

import { exigirPerfil, NOME_PERFIL } from '@/lib/auth';
import { cicloAtivo, nomeCiclo } from '@/lib/dados';
import { Abas } from '@/components/Abas';
import { Cabecalho } from '@/components/Cabecalho';

// Painel compartilhado (reunião de 19/11):
// - orientador de gestão: operação do ciclo (configura, importa, monta equipes, avalia, lança nota do cliente)
// - coordenação: acompanhamento do processo, resultados e histórico
const ABAS_GESTAO = [
  { href: '/painel/configuracao', rotulo: 'Configuração' },
  { href: '/painel/estudantes', rotulo: 'Estudantes' },
  { href: '/painel/equipes', rotulo: 'Equipes' },
  { href: '/painel/avaliar', rotulo: 'Avaliar equipes' },
  { href: '/painel/acompanhamento', rotulo: 'Acompanhamento' },
  { href: '/painel/resultados', rotulo: 'Resultados' },
  { href: '/painel/historico', rotulo: 'Histórico' },
];

const ABAS_COORDENACAO = [
  { href: '/painel/acompanhamento', rotulo: 'Acompanhamento' },
  { href: '/painel/resultados', rotulo: 'Resultados' },
  { href: '/painel/historico', rotulo: 'Histórico' },
];

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const s = await exigirPerfil('gestao', 'coordenacao');
  const ciclo = await cicloAtivo();
  return (
    <>
      <Cabecalho
        subtitulo={`${NOME_PERFIL[s.perfil]} · ${ciclo ? nomeCiclo(ciclo) : 'Nenhum ciclo ativo'}`}
        usuario={s.nome}
      />
      <main className="conteudo">
        <Abas itens={s.perfil === 'gestao' ? ABAS_GESTAO : ABAS_COORDENACAO} />
        {children}
      </main>
    </>
  );
}

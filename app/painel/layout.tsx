import { exigirPerfil, NOME_PERFIL } from '@/lib/auth';
import { cicloAtivo, nomeCiclo } from '@/lib/dados';
import { Abas } from '@/components/Abas';
import { Cabecalho } from '@/components/Cabecalho';

// Painel compartilhado (reunião de 19/11):
// - orientador de gestão: operação do ciclo (configura, importa, monta equipes, avalia, lança nota do cliente)
// - orientador de execução: avalia e consulta os resultados das suas equipes
// - coordenação: acompanhamento do processo, resultados e histórico (100% das equipes)
const ABAS_GESTAO = [
  { href: '/painel/configuracao', rotulo: 'Configuração' },
  { href: '/painel/estudantes', rotulo: 'Estudantes' },
  { href: '/painel/equipes', rotulo: 'Equipes' },
  { href: '/painel/avaliar', rotulo: 'Avaliar equipes' },
  { href: '/painel/acompanhamento', rotulo: 'Acompanhamento' },
  { href: '/painel/resultados', rotulo: 'Resultados' },
  { href: '/painel/historico', rotulo: 'Histórico' },
];

// Orientador de execução técnica: avalia e consulta os resultados das equipes que orienta
const ABAS_EXECUCAO = [
  { href: '/painel/avaliar', rotulo: 'Avaliar equipes' },
  { href: '/painel/resultados', rotulo: 'Resultados' },
];

const ABAS_COORDENACAO = [
  { href: '/painel/acompanhamento', rotulo: 'Acompanhamento' },
  { href: '/painel/resultados', rotulo: 'Resultados' },
  { href: '/painel/historico', rotulo: 'Histórico' },
];

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const s = await exigirPerfil('gestao', 'execucao', 'coordenacao');
  const ciclo = await cicloAtivo();
  return (
    <>
      <Cabecalho
        subtitulo={`${NOME_PERFIL[s.perfil]} · ${ciclo ? nomeCiclo(ciclo) : 'Nenhum ciclo ativo'}`}
        usuario={s.nome}
      />
      <main className="conteudo">
        <Abas itens={s.perfil === 'gestao' ? ABAS_GESTAO : s.perfil === 'execucao' ? ABAS_EXECUCAO : ABAS_COORDENACAO} />
        {children}
      </main>
    </>
  );
}

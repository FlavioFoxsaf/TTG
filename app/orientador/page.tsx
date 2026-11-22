import { exigirPerfil } from '@/lib/auth';
import {
  cicloAtivo, dataBR, equipesDoUsuario, listarCriterios, listarEscala, membrosDaEquipe, nomeCiclo, valoresDoAvaliador,
} from '@/lib/dados';
import { Abas } from '@/components/Abas';
import { Aviso } from '@/components/Aviso';
import { Cabecalho } from '@/components/Cabecalho';
import { FormAvaliacao } from '@/components/FormAvaliacao';

type Busca = { equipe?: string; ok?: string; erro?: string };

// HU03 e HU05: o orientador vê só as equipes que orienta e avalia a equipe e cada integrante
export default async function Orientador({ searchParams }: { searchParams: Promise<Busca> }) {
  const s = await exigirPerfil('orientador');
  const busca = await searchParams;
  const ciclo = await cicloAtivo();
  const equipes = ciclo ? await equipesDoUsuario(s, ciclo.id) : [];
  const equipe = equipes.find((e) => e.id === Number(busca.equipe)) ?? equipes[0];

  if (!ciclo || !equipe) {
    return (
      <>
        <Cabecalho subtitulo="Orientador" usuario={s.nome} />
        <main className="conteudo"><div className="cartao">Nenhuma equipe sob sua orientação no ciclo atual.</div></main>
      </>
    );
  }

  const [criterios, escala, membros, valores] = await Promise.all([
    listarCriterios(ciclo.id),
    listarEscala(ciclo.id),
    membrosDaEquipe(equipe.id),
    valoresDoAvaliador(s.id, equipe.id),
  ]);
  const papel = equipe.orient_gestao_id === s.id ? 'orientador de gestão' : 'orientador de execução técnica';
  const volta = `/orientador?equipe=${equipe.id}`;
  const comum = { equipeId: equipe.id, volta, escala, valores, bloqueado: !ciclo.janela_aberta };

  return (
    <>
      <Cabecalho
        subtitulo={`${nomeCiclo(ciclo)} · janela de ${dataBR(ciclo.janela_inicio)} a ${dataBR(ciclo.janela_fim)}`}
        usuario={s.nome}
      />
      <main className="conteudo">
        <Abas itens={equipes.map((e) => ({ href: `/orientador?equipe=${e.id}`, rotulo: e.nome }))} ativa={volta} />
        <Aviso busca={busca} />

        <section className="cartao">
          <h2>{equipe.nome} — avaliação da equipe</h2>
          <p className="suave">Você é {papel} desta equipe. Notas de 0 a 10.</p>
          <FormAvaliacao {...comum} alvos={[]} criterios={criterios.filter((c) => c.tipo === 'equipe' && c.fonte === 'orientador')} />
        </section>

        <section className="cartao">
          <h2>{equipe.nome} — avaliação dos integrantes</h2>
          <FormAvaliacao {...comum} alvos={membros} criterios={criterios.filter((c) => c.tipo === 'individual')} />
        </section>
      </main>
    </>
  );
}

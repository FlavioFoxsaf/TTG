import type { Sessao } from '@/lib/auth';
import {
  criteriosDoAvaliador, dataBR, equipesDoUsuario, listarCriterios, listarEscala, membrosDaEquipe, valoresDoAvaliador,
  type Ciclo,
} from '@/lib/dados';
import { Abas } from '@/components/Abas';
import { FormAvaliacao } from '@/components/FormAvaliacao';

// HU03 e HU05: o orientador vê só as equipes que orienta e avalia a equipe e cada integrante,
// com os critérios do seu olhar (gestão de projetos ou execução técnica).
// O orientador de gestão também lança a nota do cliente.
export async function AreaOrientador({ s, ciclo, equipeId, base }: { s: Sessao; ciclo: Ciclo; equipeId?: number; base: string }) {
  const equipes = await equipesDoUsuario(s, ciclo.id);
  const equipe = equipes.find((e) => e.id === equipeId) ?? equipes[0];
  if (!equipe) return <div className="cartao">Nenhuma equipe sob sua orientação no ciclo atual.</div>;

  const [criterios, escala, membros, valores] = await Promise.all([
    listarCriterios(ciclo.id),
    listarEscala(ciclo.id),
    membrosDaEquipe(equipe.id),
    valoresDoAvaliador(s.id, equipe.id),
  ]);
  const ehGestao = equipe.orient_gestao_id === s.id;
  const meus = criteriosDoAvaliador(criterios, ehGestao ? 'gestao' : 'execucao');
  const doCliente = meus.equipe.filter((c) => c.fonte === 'cliente');
  const daEquipe = meus.equipe.filter((c) => c.fonte !== 'cliente');
  const volta = `${base}?equipe=${equipe.id}`;
  const comum = {
    equipeId: equipe.id, volta, escala, valores,
    bloqueado: !ciclo.janela_aberta,
    mensagemBloqueio: `O período dos orientadores vai de ${dataBR(ciclo.janela_inicio)} a ${dataBR(ciclo.janela_fim)}.`,
  };

  return (
    <>
      <Abas itens={equipes.map((e) => ({ href: `${base}?equipe=${e.id}`, rotulo: e.nome }))} ativa={volta} />

      <section className="cartao">
        <h2>{equipe.nome} — avaliação da equipe</h2>
        <p className="suave">
          Você é <strong>{ehGestao ? 'orientador de gestão de projetos' : 'orientador de execução técnica'}</strong> desta
          equipe{equipe.cliente ? ` · cliente: ${equipe.cliente}` : ''}. Notas de 0 a 10.
        </p>
        {daEquipe.length ? (
          <FormAvaliacao {...comum} alvos={[]} criterios={daEquipe} />
        ) : (
          <p className="suave">Não há componentes da equipe para o seu papel neste ciclo.</p>
        )}
      </section>

      {ehGestao && doCliente.length > 0 && (
        <section className="cartao">
          <h2>{equipe.nome} — nota do cliente</h2>
          <p className="suave">Lançada pelo orientador de gestão a partir do retorno do cliente. Nota de 0 a 10.</p>
          <FormAvaliacao {...comum} alvos={[]} criterios={doCliente} />
        </section>
      )}

      <section className="cartao">
        <h2>{equipe.nome} — avaliação dos integrantes</h2>
        {meus.individual.length ? (
          <FormAvaliacao {...comum} alvos={membros} criterios={meus.individual} />
        ) : (
          <p className="suave">Não há critérios individuais para o seu papel neste ciclo.</p>
        )}
      </section>
    </>
  );
}

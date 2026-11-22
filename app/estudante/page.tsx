import { exigirPerfil } from '@/lib/auth';
import { query } from '@/lib/db';
import { NOME_FONTE, type Memoria } from '@/lib/calculo';
import {
  cicloAtivo, comentarioDoAvaliador, criteriosDoAvaliador, dataBR, equipesDoUsuario, listarCriterios, listarEscala,
  membrosDaEquipe, num, periodoBR, valoresDoAvaliador, type Ciclo,
} from '@/lib/dados';
import { Abas } from '@/components/Abas';
import { Aviso } from '@/components/Aviso';
import { Cabecalho } from '@/components/Cabecalho';
import { FormAvaliacao } from '@/components/FormAvaliacao';

type Busca = { aba?: string; ok?: string; erro?: string };

const ABAS = [
  { href: '/estudante?aba=projeto', rotulo: '1. Projeto' },
  { href: '/estudante?aba=auto', rotulo: '2. Autoavaliação' },
  { href: '/estudante?aba=colegas', rotulo: '3. Avaliação dos colegas' },
  { href: '/estudante?aba=nota', rotulo: 'Minha nota' },
];

// HU06 e HU08: o estudante avalia o projeto, a si mesmo e os colegas, e consulta só a própria nota.
// Tudo só fica disponível quando a gestão libera o período (reunião de 19/11).
export default async function Estudante({ searchParams }: { searchParams: Promise<Busca> }) {
  const s = await exigirPerfil('estudante');
  const busca = await searchParams;
  const aba = busca.aba ?? 'projeto';
  const ciclo = await cicloAtivo();
  const [equipe] = ciclo ? await equipesDoUsuario(s, ciclo.id) : [];

  return (
    <>
      <Cabecalho subtitulo={equipe ? `Estudante · ${equipe.nome}` : 'Estudante'} usuario={s.nome} />
      <main className="conteudo">
        <Abas itens={ABAS} ativa={`/estudante?aba=${aba}`} />
        <Aviso busca={busca} />
        {ciclo && <Periodos c={ciclo} />}
        <section className="cartao">
          {aba === 'nota' ? (
            <MinhaNota estudanteId={s.id} />
          ) : !ciclo || !equipe ? (
            'Você ainda não está em uma equipe no ciclo atual.'
          ) : (
            <Avaliacao aba={aba} estudanteId={s.id} ciclo={ciclo} equipeId={equipe.id} />
          )}
        </section>
      </main>
    </>
  );
}

function Periodos({ c }: { c: Ciclo }) {
  const item = (rotulo: string, aberta: boolean, texto: string) => (
    <div>
      <span className={`etiqueta ${aberta ? 'ok' : 'alerta'}`}>{aberta ? 'liberado' : 'fechado'}</span>
      <p style={{ margin: '6px 0 0' }}>{rotulo}</p>
      <small className="suave">{texto}</small>
    </div>
  );
  return (
    <div className="resumo">
      {item('Projeto e autoavaliação', c.auto_aberta, periodoBR(c.auto_inicio, c.auto_fim))}
      {item('Avaliação dos colegas', c.colegas_aberta, periodoBR(c.colegas_inicio, c.colegas_fim))}
      {item('Minha nota', c.nota_liberada, c.nota_liberada_em ? `a partir de ${dataBR(c.nota_liberada_em)}` : 'ainda não liberada')}
    </div>
  );
}

async function Avaliacao(p: { aba: string; estudanteId: number; ciclo: Ciclo; equipeId: number }) {
  const [criterios, escala, membros, valores, comentario] = await Promise.all([
    listarCriterios(p.ciclo.id),
    listarEscala(p.ciclo.id),
    membrosDaEquipe(p.equipeId),
    valoresDoAvaliador(p.estudanteId, p.equipeId),
    comentarioDoAvaliador(p.estudanteId, p.equipeId),
  ]);
  const meus = criteriosDoAvaliador(criterios, 'estudante');
  const fechado = (periodo: string) => `Esta etapa não está liberada (${periodo}).`;
  const comum = { equipeId: p.equipeId, volta: `/estudante?aba=${p.aba}`, escala, valores };
  const periodoAuto = periodoBR(p.ciclo.auto_inicio, p.ciclo.auto_fim);

  if (p.aba === 'auto')
    return (
      <>
        <h2>Autoavaliação</h2>
        <p className="suave">Avalie o seu papel e a sua contribuição ao trabalho e à produção da equipe.</p>
        <FormAvaliacao
          {...comum} criterios={meus.individual} alvos={membros.filter((m) => m.id === p.estudanteId)}
          bloqueado={!p.ciclo.auto_aberta} mensagemBloqueio={fechado(periodoAuto)}
        />
      </>
    );
  if (p.aba === 'colegas')
    return (
      <>
        <h2>Avaliação dos colegas</h2>
        <p className="suave">Confidencial: cada colega vê apenas a média das notas que recebeu.</p>
        <FormAvaliacao
          {...comum} criterios={meus.individual} alvos={membros.filter((m) => m.id !== p.estudanteId)}
          bloqueado={!p.ciclo.colegas_aberta} mensagemBloqueio={fechado(periodoBR(p.ciclo.colegas_inicio, p.ciclo.colegas_fim))}
        />
      </>
    );
  return (
    <>
      <h2>Avaliação geral do trabalho em equipe</h2>
      <p className="suave">Avalie o trabalho da sua equipe enquanto grupo (1 = muito baixo, 5 = muito alto).</p>
      <FormAvaliacao
        {...comum} alvos={[]} criterios={meus.equipe}
        bloqueado={!p.ciclo.auto_aberta} mensagemBloqueio={fechado(periodoAuto)}
        comentario={{
          valor: comentario,
          rotulo: 'Comentários sobre o trabalho em equipe (reflexões, críticas, elogios, sugestões) — opcional',
        }}
      />
    </>
  );
}

// RN06: busca apenas o resultado do próprio estudante, e só de ciclos com a nota liberada
async function MinhaNota({ estudanteId }: { estudanteId: number }) {
  const [r] = await query<{ semestre: string; fase: number; nota_equipe: number; cdi: number; nota_final: number; memoria: Memoria }>(
    `select c.semestre, c.fase, r.nota_equipe, r.cdi, r.nota_final, r.memoria
     from resultado r join ciclo c on c.id = r.ciclo_id
     where r.estudante_id = $1 and c.nota_liberada_em is not null
       and (now() at time zone 'America/Sao_Paulo')::date >= c.nota_liberada_em
     order by r.calculado_em desc limit 1`,
    [estudanteId],
  );
  if (!r) return <>Sua nota ainda não foi liberada pela coordenação do TTG.</>;
  const colegas = r.memoria.fontes.find((f) => f.nome === NOME_FONTE.colega)?.valor ?? null;
  return (
    <>
      <h2>Minha nota — Semestre {r.semestre}, Fase {r.fase}</h2>
      <table>
        <tbody>
          <tr><td>Nota da equipe</td><td className="num">{num(r.nota_equipe)}</td></tr>
          <tr><td>Média da avaliação dos colegas</td><td className="num">{num(colegas)}</td></tr>
          <tr><td>Coeficiente de Desempenho Individual (CDI)</td><td className="num">{num(r.cdi)}</td></tr>
          <tr><td><strong>Nota final</strong> (nota da equipe × CDI)</td><td className="num destaque">{num(r.nota_final)}</td></tr>
        </tbody>
      </table>
    </>
  );
}

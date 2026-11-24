import Link from 'next/link';
import { exigirPerfil } from '@/lib/auth';
import { errosDePeso, NOME_PAPEL, type Papel } from '@/lib/calculo';
import {
  acompanhamento, buscarCiclo, cicloAtivo, comentariosDoCiclo, equipesVisiveis, integrantesDoCiclo, listarCriterios,
  listarResultados, nomeCiclo, num, previaResultados, relatorioAvaliacoes, type ResultadoLinha,
} from '@/lib/dados';
import { query } from '@/lib/db';
import { Aviso } from '@/components/Aviso';
import { calcularNotas } from '../acoes';

type Busca = { ciclo?: string; equipe?: string; estudante?: string; ok?: string; erro?: string };

// RF06, RF08 / HU07, HU09: todas as equipes (coordenação) ou as do orientador de gestão,
// com integrantes e notas; antes do cálculo, mostra uma prévia com as avaliações já feitas
export default async function Resultados({ searchParams }: { searchParams: Promise<Busca> }) {
  const s = await exigirPerfil('gestao', 'execucao', 'coordenacao');
  const busca = await searchParams;
  const ciclo = busca.ciclo ? await buscarCiclo(Number(busca.ciclo)) : await cicloAtivo();
  if (!ciclo) return <div className="cartao">Nenhum ciclo avaliativo encontrado.</div>;

  const [equipes, integrantes, gravados, comentarios, pendencias, criterios, orientadores] = await Promise.all([
    equipesVisiveis(s, ciclo.id),
    integrantesDoCiclo(ciclo.id),
    listarResultados(ciclo.id),
    comentariosDoCiclo(ciclo.id),
    acompanhamento(ciclo),
    listarCriterios(ciclo.id),
    query<{ id: number; nome: string }>(`select id, nome from usuario where perfil in ('gestao', 'execucao')`),
  ]);
  const visivel = new Set(equipes.map((e) => e.id));

  // Notas gravadas pelo "Calcular notas"; sem elas, prévia calculada agora (não gravada)
  const previa = !gravados.length;
  const resultados = (previa ? await previaResultados(ciclo) : gravados).filter((r) => visivel.has(r.equipe_id));
  const errosPeso = previa
    ? errosDePeso(criterios, {
        orient_gestao: ciclo.peso_orient_gestao, orient_execucao: ciclo.peso_orient_execucao,
        auto: ciclo.peso_auto, colega: ciclo.peso_colegas,
      })
    : [];
  const fontes = resultados[0]?.memoria.fontes.map((f) => f.nome) ?? [];
  const calculadoEm = gravados[0]?.calculado_em;
  const nomeOrientador = (id: number | null) => orientadores.find((o) => o.id === id)?.nome ?? '—';
  const preenchido = (equipeId: number) => {
    const p = pendencias.filter((x) => x.equipe_id === equipeId);
    const esperado = p.reduce((t, x) => t + x.esperado, 0);
    return esperado ? Math.round((100 * p.reduce((t, x) => t + x.feito, 0)) / esperado) : 0;
  };
  const selecionado = resultados.find((r) => r.estudante_id === Number(busca.estudante));
  const aberta = Number(busca.equipe) || selecionado?.equipe_id;
  const url = (extra = '') => `/painel/resultados?ciclo=${ciclo.id}${extra}`;

  return (
    <>
      <Aviso busca={busca} />
      <section className="cartao">
        <div className="linha">
          <div>
            <h2 style={{ marginBottom: 4 }}>Resultados — {nomeCiclo(ciclo)}</h2>
            <small className="suave">
              {s.perfil === 'coordenacao' ? `Todas as ${equipes.length} equipes do ciclo` : `Suas ${equipes.length} equipe(s) (só as que você orienta)`}
              {' · '}
              {previa ? 'prévia com as avaliações já registradas (ainda não gravada)' : `notas calculadas em ${calculadoEm ? new Date(calculadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}`}
            </small>
          </div>
          {s.perfil !== 'execucao' && <div className="linha">
            <form action={calcularNotas}>
              <input type="hidden" name="ciclo" value={ciclo.id} />
              <button className="botao secundario">{previa ? 'Calcular notas' : 'Recalcular notas'}</button>
            </form>
            <a className="botao secundario" href={`/painel/relatorio?ciclo=${ciclo.id}`}>Report CSV</a>
            <a className="botao" href={`/painel/exportar?ciclo=${ciclo.id}`}>Exportar notas</a>
          </div>}
        </div>
        {previa && (
          <p className="aviso" style={{ marginTop: 12 }}>
            Estas notas são uma <strong>prévia</strong>: mudam conforme as avaliações forem chegando.
            {s.perfil !== 'execucao' && ' Use “Calcular notas” para gravá-las (o estudante e a exportação usam as notas gravadas).'}
            {errosPeso.length > 0 && <><br />Atenção: {errosPeso.join(' ')}</>}
          </p>
        )}
        {!equipes.length && <p>Nenhuma equipe {s.perfil !== 'coordenacao' ? 'sob sua orientação ' : ''}neste ciclo.</p>}
      </section>

      {equipes.map((e) => {
        const membros = integrantes.filter((i) => i.equipe_id === e.id);
        const notas = resultados.filter((r) => r.equipe_id === e.id);
        const nota = (id: number) => notas.find((r) => r.estudante_id === id);
        const pct = preenchido(e.id);
        const daEquipe = comentarios.filter((c) => c.equipe_id === e.id);
        return (
          <details key={e.id} className="cartao" open={aberta === e.id}>
            <summary style={{ cursor: 'pointer' }}>
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', width: 'calc(100% - 24px)' }}>
                <strong style={{ fontSize: 16 }}>{e.nome}</strong>
                {e.cliente && <span className="suave">cliente: {e.cliente}</span>}
                <span className="suave">{membros.length} integrante(s)</span>
                <span className="suave">preenchimento {pct}%</span>
                <span style={{ marginLeft: 'auto' }}>
                  nota da equipe <strong className="destaque">{num(notas[0]?.nota_equipe)}</strong>
                </span>
              </span>
            </summary>

            <p className="suave" style={{ margin: '10px 0' }}>
              Orientador de gestão: {nomeOrientador(e.orient_gestao_id)} · Orientador de execução: {nomeOrientador(e.orient_execucao_id)}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Estudante</th><th>Matrícula</th><th>Curso</th>
                  {fontes.map((f) => <th key={f} className="num">{f}</th>)}
                  <th className="num">Conceito</th><th className="num">CDI</th><th className="num">Nota final</th>
                </tr>
              </thead>
              <tbody>
                {membros.map((m) => {
                  const r = nota(m.id);
                  return (
                    <tr key={m.id} style={selecionado?.estudante_id === m.id ? { background: '#fff7ed' } : undefined}>
                      <td>
                        {r ? <Link href={url(`&equipe=${e.id}&estudante=${m.id}`)}>{m.nome}</Link> : m.nome}
                        {e.lider_id === m.id && <span className="suave"> (líder)</span>}
                      </td>
                      <td>{m.matricula ?? '—'}</td>
                      <td>{m.curso ?? '—'}</td>
                      {fontes.map((f) => <td key={f} className="num">{num(r?.memoria.fontes.find((x) => x.nome === f)?.valor)}</td>)}
                      <td className="num">{num(r?.conceito)}</td>
                      <td className="num">{num(r?.cdi)}</td>
                      <td className="num"><strong>{num(r?.nota_final)}</strong></td>
                    </tr>
                  );
                })}
                {!membros.length && <tr><td colSpan={6 + fontes.length}>Equipe sem integrantes.</td></tr>}
              </tbody>
            </table>
            <p className="suave">Clique no nome do estudante para ver a memória de cálculo e as avaliações de origem.</p>

            {daEquipe.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary>Comentários dos estudantes ({daEquipe.length}, anônimos)</summary>
                {[...new Set(daEquipe.map((c) => c.rotulo))].map((rotulo) => (
                  <div key={rotulo}>
                    <p style={{ margin: '8px 0 2px' }}><strong>{rotulo}</strong></p>
                    <ul style={{ marginTop: 0 }}>
                      {daEquipe.filter((c) => c.rotulo === rotulo).map((c, i) => <li key={i}>{c.texto}</li>)}
                    </ul>
                  </div>
                ))}
              </details>
            )}

            {selecionado?.equipe_id === e.id && <MemoriaCalculo r={selecionado} cicloId={ciclo.id} previa={previa} />}
          </details>
        );
      })}
    </>
  );
}

// RNF03: a nota é aberta até a memória de cálculo e as avaliações de origem
async function MemoriaCalculo({ r, cicloId, previa }: { r: ResultadoLinha; cicloId: number; previa: boolean }) {
  const origem = (await relatorioAvaliacoes(cicloId)).filter(
    (a) => a.equipe_id === r.equipe_id && (a.avaliado_id === r.estudante_id || a.avaliado_id === null),
  );
  const m = r.memoria;
  return (
    <section style={{ borderTop: '2px solid var(--borda)', marginTop: 16, paddingTop: 8 }}>
      <h2>Memória de cálculo — {r.estudante}{previa && <span className="suave"> (prévia)</span>}</h2>

      <h3>Nota da equipe: {num(r.nota_equipe)} (média ponderada dos componentes)</h3>
      <table>
        <thead><tr><th>Componente</th><th className="num">Peso</th><th className="num">Valor</th></tr></thead>
        <tbody>
          {m.componentesEquipe.map((c) => (
            <tr key={c.nome}><td>{c.nome}</td><td className="num">{num(c.peso, 0)}</td><td className="num">{num(c.valor)}</td></tr>
          ))}
        </tbody>
      </table>

      <h3>Conceito individual: {num(r.conceito)} (quatro fontes) · maior conceito da equipe: {num(m.maiorConceitoEquipe)}</h3>
      <p className="suave">CDI = Coeficiente de Desempenho Individual = conceito do estudante ÷ maior conceito da equipe.</p>
      <table>
        <thead><tr><th>Fonte</th><th className="num">Peso</th><th className="num">Valor</th></tr></thead>
        <tbody>
          {m.fontes.map((f) => (
            <tr key={f.nome}><td>{f.nome}</td><td className="num">{num(f.peso, 0)}</td><td className="num">{num(f.valor)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="destaque">{m.formula}</p>
      <p className="suave">Itens sem avaliação (—) são ignorados e os pesos restantes são redistribuídos.</p>

      <h3>Avaliações de origem</h3>
      <table>
        <thead><tr><th>Avaliador</th><th>Papel</th><th>Avaliado</th><th>Critério</th><th className="num">Valor</th><th>Em</th></tr></thead>
        <tbody>
          {origem.map((a, i) => (
            <tr key={i}>
              <td>{a.avaliador}</td>
              <td>{NOME_PAPEL[a.papel as Papel] ?? a.papel}</td>
              <td>{a.avaliado ?? 'Equipe'}</td>
              <td>{a.criterio}</td>
              <td className="num">{num(a.valor, 1)}</td>
              <td>{a.atualizado_em}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

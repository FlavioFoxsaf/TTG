import Link from 'next/link';
import { exigirPerfil } from '@/lib/auth';
import { NOME_PAPEL, type Papel } from '@/lib/calculo';
import {
  buscarCiclo, cicloAtivo, comentariosDoCiclo, listarEquipes, listarResultados, nomeCiclo, num, relatorioAvaliacoes, type ResultadoLinha,
} from '@/lib/dados';
import { Aviso } from '@/components/Aviso';
import { calcularNotas } from '../acoes';

type Busca = { ciclo?: string; estudante?: string; ok?: string; erro?: string };

// RF06, RF08 / HU07, HU09: cálculo, relatório por equipe e por estudante, memória de cálculo
export default async function Resultados({ searchParams }: { searchParams: Promise<Busca> }) {
  await exigirPerfil('gestao', 'coordenacao');
  const busca = await searchParams;
  const ciclo = busca.ciclo ? await buscarCiclo(Number(busca.ciclo)) : await cicloAtivo();
  if (!ciclo) return <div className="cartao">Nenhum ciclo avaliativo encontrado.</div>;

  const [resultados, comentarios, cadastro] = await Promise.all([
    listarResultados(ciclo.id),
    comentariosDoCiclo(ciclo.id),
    listarEquipes(ciclo.id),
  ]);
  const selecionado = resultados.find((r) => r.estudante_id === Number(busca.estudante));
  const equipes = [...new Set(resultados.map((r) => r.equipe))];
  const fontes = resultados[0]?.memoria.fontes.map((f) => f.nome) ?? [];
  const cliente = (id: number) => cadastro.find((e) => e.id === id)?.cliente;

  return (
    <>
      <Aviso busca={busca} />
      <section className="cartao">
        <div className="linha">
          <h2>Resultados — {nomeCiclo(ciclo)}</h2>
          <div className="linha">
            <form action={calcularNotas}>
              <input type="hidden" name="ciclo" value={ciclo.id} />
              <button className="botao secundario">Calcular notas</button>
            </form>
            <a className="botao secundario" href={`/painel/relatorio?ciclo=${ciclo.id}`}>Report CSV</a>
            <a className="botao" href={`/painel/exportar?ciclo=${ciclo.id}`}>Exportar notas</a>
          </div>
        </div>
        {!resultados.length && <p>As notas deste ciclo ainda não foram calculadas.</p>}

        {equipes.map((equipe) => {
          const daEquipe = resultados.filter((r) => r.equipe === equipe);
          return (
            <div key={equipe}>
              <h3>
                {equipe} — nota da equipe {num(daEquipe[0].nota_equipe)}
                {cliente(daEquipe[0].equipe_id) && <span className="suave"> · cliente: {cliente(daEquipe[0].equipe_id)}</span>}
              </h3>
              <table>
                <thead>
                  <tr>
                    <th>Estudante</th>
                    {fontes.map((f) => <th key={f} className="num">{f}</th>)}
                    <th className="num">Conceito individual</th><th className="num">CDI</th><th className="num">Nota final</th>
                  </tr>
                </thead>
                <tbody>
                  {daEquipe.map((r) => (
                    <tr key={r.estudante_id}>
                      <td><Link href={`/painel/resultados?ciclo=${ciclo.id}&estudante=${r.estudante_id}`}>{r.estudante}</Link></td>
                      {r.memoria.fontes.map((f) => <td key={f.nome} className="num">{num(f.valor)}</td>)}
                      <td className="num">{num(r.conceito)}</td>
                      <td className="num">{num(r.cdi)}</td>
                      <td className="num"><strong>{num(r.nota_final)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {comentarios.some((c) => c.equipe === equipe) && (
                <details style={{ marginTop: 8 }}>
                  <summary>Comentários dos estudantes ({comentarios.filter((c) => c.equipe === equipe).length}, anônimos)</summary>
                  {[...new Set(comentarios.filter((c) => c.equipe === equipe).map((c) => c.rotulo))].map((rotulo) => (
                    <div key={rotulo}>
                      <p style={{ margin: '8px 0 2px' }}><strong>{rotulo}</strong></p>
                      <ul style={{ marginTop: 0 }}>
                        {comentarios.filter((c) => c.equipe === equipe && c.rotulo === rotulo).map((c, i) => <li key={i}>{c.texto}</li>)}
                      </ul>
                    </div>
                  ))}
                </details>
              )}
            </div>
          );
        })}
      </section>

      {selecionado && <MemoriaCalculo r={selecionado} cicloId={ciclo.id} />}
    </>
  );
}

// RNF03: a nota é aberta até a memória de cálculo e as avaliações de origem
async function MemoriaCalculo({ r, cicloId }: { r: ResultadoLinha; cicloId: number }) {
  const origem = (await relatorioAvaliacoes(cicloId)).filter(
    (a) => a.equipe_id === r.equipe_id && (a.avaliado_id === r.estudante_id || a.avaliado_id === null),
  );
  const m = r.memoria;
  return (
    <section className="cartao">
      <h2>Memória de cálculo — {r.estudante}</h2>

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

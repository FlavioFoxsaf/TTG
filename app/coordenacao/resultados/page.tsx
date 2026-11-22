import Link from 'next/link';
import { exigirPerfil } from '@/lib/auth';
import { NOME_FONTE, type Fonte } from '@/lib/calculo';
import { buscarCiclo, cicloAtivo, listarResultados, nomeCiclo, num, relatorioAvaliacoes, type ResultadoLinha } from '@/lib/dados';
import { Aviso } from '@/components/Aviso';
import { calcularNotas } from '../acoes';

type Busca = { ciclo?: string; estudante?: string; ok?: string; erro?: string };

// RF06, RF08 / HU07, HU09: cálculo, relatório por equipe e por estudante, memória de cálculo
export default async function Resultados({ searchParams }: { searchParams: Promise<Busca> }) {
  await exigirPerfil('coordenacao');
  const busca = await searchParams;
  const ciclo = busca.ciclo ? await buscarCiclo(Number(busca.ciclo)) : await cicloAtivo();
  if (!ciclo) return <div className="cartao">Nenhum ciclo avaliativo encontrado.</div>;

  const resultados = await listarResultados(ciclo.id);
  const selecionado = resultados.find((r) => r.estudante_id === Number(busca.estudante));
  const equipes = [...new Set(resultados.map((r) => r.equipe))];

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
            <a className="botao secundario" href={`/coordenacao/relatorio?ciclo=${ciclo.id}`}>Report CSV</a>
            <a className="botao" href={`/coordenacao/exportar?ciclo=${ciclo.id}`}>Exportar notas</a>
          </div>
        </div>
        {!resultados.length && <p>As notas deste ciclo ainda não foram calculadas.</p>}

        {equipes.map((equipe) => {
          const daEquipe = resultados.filter((r) => r.equipe === equipe);
          return (
            <div key={equipe}>
              <h3>{equipe} — nota da equipe {num(daEquipe[0].nota_equipe)}</h3>
              <table>
                <thead>
                  <tr><th>Estudante</th><th className="num">Conceito individual</th><th className="num">CDI</th><th className="num">Nota final</th></tr>
                </thead>
                <tbody>
                  {daEquipe.map((r) => (
                    <tr key={r.estudante_id}>
                      <td><Link href={`/coordenacao/resultados?ciclo=${ciclo.id}&estudante=${r.estudante_id}`}>{r.estudante}</Link></td>
                      <td className="num">{num(r.conceito)}</td>
                      <td className="num">{num(r.cdi)}</td>
                      <td className="num">{num(r.nota_final)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <td>{NOME_FONTE[a.papel as Fonte] ?? 'Avaliação do projeto'}</td>
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

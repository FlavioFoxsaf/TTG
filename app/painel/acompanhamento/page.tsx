import Link from 'next/link';
import { exigirPerfil } from '@/lib/auth';
import { acompanhamento, buscarCiclo, cicloAtivo, dataBR, nomeCiclo, type Ciclo, type Pendencia } from '@/lib/dados';
import { Aviso } from '@/components/Aviso';

type Busca = { ciclo?: string; equipe?: string; ok?: string; erro?: string };

// Acompanhamento do processo (reunião de 19/11): quanto já foi preenchido, quem falta e prazos críticos
export default async function Acompanhamento({ searchParams }: { searchParams: Promise<Busca> }) {
  await exigirPerfil('gestao', 'coordenacao');
  const busca = await searchParams;
  const ciclo = busca.ciclo ? await buscarCiclo(Number(busca.ciclo)) : await cicloAtivo();
  if (!ciclo) return <div className="cartao">Nenhum ciclo avaliativo encontrado.</div>;

  const linhas = await acompanhamento(ciclo);
  const pct = (l: Pick<Pendencia, 'esperado' | 'feito'>[]) => {
    const esperado = l.reduce((s, x) => s + x.esperado, 0);
    return esperado ? Math.round((100 * l.reduce((s, x) => s + x.feito, 0)) / esperado) : 0;
  };
  const pendentes = linhas.filter((l) => l.feito < l.esperado);
  const equipes = [...new Map(linhas.map((l) => [l.equipe_id, l.equipe])).entries()];
  const selecionada = Number(busca.equipe) || null;
  const alertas = prazosCriticos(ciclo, linhas);

  return (
    <>
      <Aviso busca={busca} />
      <h2>Acompanhamento — {nomeCiclo(ciclo)}</h2>

      <div className="resumo">
        <div><small className="suave">Preenchimento geral</small><strong>{pct(linhas)}%</strong></div>
        <div><small className="suave">Avaliadores com pendência</small><strong>{new Set(pendentes.map((p) => p.avaliador_id)).size}</strong></div>
        <div><small className="suave">Equipes 100% preenchidas</small><strong>{equipes.filter(([id]) => pct(linhas.filter((l) => l.equipe_id === id)) === 100).length} de {equipes.length}</strong></div>
      </div>

      {alertas.length > 0 && (
        <section className="cartao">
          <h3 style={{ marginTop: 0 }}>Prazos críticos</h3>
          {alertas.map((a) => (
            <p key={a.texto} style={{ margin: '4px 0' }}>
              <span className={`etiqueta ${a.nivel}`}>{a.rotulo}</span> {a.texto}
            </p>
          ))}
        </section>
      )}

      <section className="cartao">
        <h3 style={{ marginTop: 0 }}>Preenchimento por equipe</h3>
        <table>
          <thead>
            <tr><th>Equipe</th><th>Orient. gestão</th><th>Orient. execução</th><th>Estudantes</th><th>Total</th><th></th></tr>
          </thead>
          <tbody>
            {equipes.map(([id, nome]) => {
              const daEquipe = linhas.filter((l) => l.equipe_id === id);
              const por = (papel: string) => daEquipe.filter((l) => l.papel === papel);
              return (
                <tr key={id}>
                  <td>{nome}</td>
                  <td><Barra valor={pct(por('Orientador de gestão'))} /></td>
                  <td><Barra valor={pct(por('Orientador de execução'))} /></td>
                  <td><Barra valor={pct(por('Estudante'))} /></td>
                  <td><Barra valor={pct(daEquipe)} /></td>
                  <td><Link href={`/painel/acompanhamento?ciclo=${ciclo.id}&equipe=${id}`}>Quem falta</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="cartao">
        <div className="linha">
          <h3 style={{ marginTop: 0 }}>
            {selecionada ? `Avaliadores — ${equipes.find(([id]) => id === selecionada)?.[1] ?? ''}` : 'Quem ainda não concluiu'}
          </h3>
          {selecionada && <Link href={`/painel/acompanhamento?ciclo=${ciclo.id}`}>Ver todas as equipes</Link>}
        </div>
        <table>
          <thead><tr><th>Equipe</th><th>Avaliador</th><th>Papel</th><th className="num">Respondido</th><th>Situação</th></tr></thead>
          <tbody>
            {(selecionada ? linhas.filter((l) => l.equipe_id === selecionada) : pendentes).map((l) => (
              <tr key={`${l.equipe_id}-${l.avaliador_id}`}>
                <td>{l.equipe}</td>
                <td>{l.avaliador}</td>
                <td>{l.papel}</td>
                <td className="num">{l.feito} de {l.esperado}</td>
                <td>
                  <span className={`etiqueta ${l.feito >= l.esperado ? 'ok' : l.feito ? 'alerta' : 'erro'}`}>
                    {l.feito >= l.esperado ? 'concluído' : l.feito ? 'em andamento' : 'não iniciado'}
                  </span>
                </td>
              </tr>
            ))}
            {!selecionada && !pendentes.length && (
              <tr><td colSpan={5}>Todas as avaliações foram preenchidas.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Barra({ valor }: { valor: number }) {
  return (
    <>
      <div className={`barra ${valor < 100 ? 'baixa' : ''}`}><span style={{ width: `${valor}%` }} /></div>
      <small>{valor}%</small>
    </>
  );
}

// Dias até o fim do período (data de Brasília); negativo = já encerrado
function diasAte(fim: string) {
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${fim}T00:00:00`).getTime() - hoje.getTime()) / 86_400_000);
}

// Períodos abertos que terminam em até 3 dias com avaliações pendentes, e períodos encerrados com pendência
function prazosCriticos(c: Ciclo, linhas: Pendencia[]) {
  const periodos = [
    { nome: 'orientadores', fim: c.janela_fim, aberto: c.janela_aberta, papeis: ['Orientador de gestão', 'Orientador de execução'] },
    { nome: 'avaliação pelos estudantes', fim: c.colegas_fim ?? c.auto_fim, aberto: c.auto_aberta || c.colegas_aberta, papeis: ['Estudante'] },
  ];
  const alertas: { rotulo: string; nivel: 'erro' | 'alerta'; texto: string }[] = [];
  for (const p of periodos) {
    if (!p.fim) continue;
    const faltam = linhas.filter((l) => p.papeis.includes(l.papel) && l.feito < l.esperado);
    if (!faltam.length) continue;
    const dias = diasAte(p.fim);
    const quem = `${faltam.length} avaliador(es) com pendência`;
    if (dias < 0 && !p.aberto)
      alertas.push({ rotulo: 'encerrado', nivel: 'erro', texto: `O período de ${p.nome} terminou em ${dataBR(p.fim)} com ${quem}.` });
    else if (p.aberto && dias <= 3)
      alertas.push({
        rotulo: dias === 0 ? 'termina hoje' : `${dias} dia(s)`,
        nivel: 'alerta',
        texto: `O período de ${p.nome} termina em ${dataBR(p.fim)} e ainda há ${quem}.`,
      });
  }
  return alertas;
}

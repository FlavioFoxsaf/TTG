import Link from 'next/link';
import { exigirPerfil } from '@/lib/auth';
import { query } from '@/lib/db';
import { dataBR, listarCiclos, num } from '@/lib/dados';
import { Aviso } from '@/components/Aviso';
import { ativarCiclo } from '../acoes';

// RF09 / HU10: ciclos anteriores, separados por semestre
export default async function Historico({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await exigirPerfil('gestao', 'coordenacao');
  const ciclos = await listarCiclos();
  const resumo = await query<{ ciclo_id: number; equipes: number; estudantes: number; media: number | null }>(
    `select c.id as ciclo_id,
            (select count(*)::int from equipe e where e.ciclo_id = c.id) as equipes,
            (select count(*)::int from resultado r where r.ciclo_id = c.id) as estudantes,
            (select avg(nota_final)::float from resultado r where r.ciclo_id = c.id) as media
     from ciclo c`,
  );

  return (
    <>
      <Aviso busca={await searchParams} />
      <section className="cartao">
        <h2>Histórico de ciclos avaliativos</h2>
        <table>
          <thead>
            <tr>
              <th>Semestre</th><th>Modalidade</th><th>Fase</th><th>Janela dos orientadores</th>
              <th className="num">Equipes</th><th className="num">Notas</th><th className="num">Média final</th><th></th>
            </tr>
          </thead>
          <tbody>
            {ciclos.map((c) => {
              const r = resumo.find((x) => x.ciclo_id === c.id);
              return (
                <tr key={c.id}>
                  <td>{c.semestre}</td>
                  <td>{c.modalidade}</td>
                  <td>{c.fase}</td>
                  <td>{dataBR(c.janela_inicio)} a {dataBR(c.janela_fim)}</td>
                  <td className="num">{r?.equipes}</td>
                  <td className="num">{r?.estudantes}</td>
                  <td className="num">{num(r?.media)}</td>
                  <td className="linha" style={{ justifyContent: 'flex-end' }}>
                    <Link href={`/painel/resultados?ciclo=${c.id}`}>Ver resultados</Link>
                    {c.ativo ? (
                      <strong>ativo</strong>
                    ) : s.perfil === 'gestao' && (
                      <form action={ativarCiclo}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="botao secundario">Ativar</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

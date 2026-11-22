import Link from 'next/link';
import { exigirPerfil } from '@/lib/auth';
import { query } from '@/lib/db';
import { acompanhamento, cicloAtivo, listarEquipes, usuariosPorPerfil, type Equipe } from '@/lib/dados';
import { Aviso } from '@/components/Aviso';
import { excluirEquipe, salvarEquipe } from '../acoes';

type Busca = { editar?: string; ok?: string; erro?: string };

// RF02 / HU02: formação das equipes (feita pelo orientador de gestão)
export default async function Equipes({ searchParams }: { searchParams: Promise<Busca> }) {
  await exigirPerfil('gestao');
  const busca = await searchParams;
  const ciclo = await cicloAtivo();
  if (!ciclo) return <div className="cartao">Crie um ciclo avaliativo na aba Configuração.</div>;

  const [equipes, gestores, executores, estudantes, membros, pendencias] = await Promise.all([
    listarEquipes(ciclo.id),
    usuariosPorPerfil('gestao'),
    usuariosPorPerfil('execucao'),
    usuariosPorPerfil('estudante'),
    query<{ equipe_id: number; estudante_id: number }>('select equipe_id, estudante_id from membro where ciclo_id = $1', [ciclo.id]),
    acompanhamento(ciclo),
  ]);
  const nome = (id: number | null) => [...gestores, ...executores, ...estudantes].find((u) => u.id === id)?.nome ?? '—';
  const preenchido = (equipeId: number) => {
    const p = pendencias.filter((x) => x.equipe_id === equipeId);
    const esperado = p.reduce((s, x) => s + x.esperado, 0);
    return esperado ? Math.round((100 * p.reduce((s, x) => s + x.feito, 0)) / esperado) : 0;
  };
  const editando = busca.editar === 'nova' ? 'nova' : equipes.find((e) => e.id === Number(busca.editar));

  return (
    <>
      <Aviso busca={busca} />
      <section className="cartao">
        <div className="linha">
          <h2>Equipes</h2>
          <Link className="botao" href="/painel/equipes?editar=nova">+ Nova equipe</Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>Equipe</th><th>Cliente</th><th>Líder</th><th>Orient. gestão</th><th>Orient. execução</th>
              <th className="num">Integrantes</th><th>Preenchimento</th><th></th>
            </tr>
          </thead>
          <tbody>
            {equipes.map((e) => {
              const pct = preenchido(e.id);
              return (
                <tr key={e.id}>
                  <td>{e.nome}</td>
                  <td>{e.cliente ?? '—'}</td>
                  <td>{nome(e.lider_id)}</td>
                  <td>{nome(e.orient_gestao_id)}</td>
                  <td>{nome(e.orient_execucao_id)}</td>
                  <td className="num">{membros.filter((m) => m.equipe_id === e.id).length}</td>
                  <td>
                    <Link href={`/painel/acompanhamento?equipe=${e.id}`} title="Ver quem falta avaliar">
                      <div className={`barra ${pct < 100 ? 'baixa' : ''}`}><span style={{ width: `${pct}%` }} /></div>
                      <small>{pct}%</small>
                    </Link>
                  </td>
                  <td><Link href={`/painel/equipes?editar=${e.id}`}>Editar</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {editando && (
        <FormEquipe
          key={busca.editar}
          equipe={editando === 'nova' ? undefined : editando}
          gestores={gestores}
          executores={executores}
          // disponíveis: estudantes sem equipe ou já desta equipe (um estudante por equipe no semestre)
          estudantes={estudantes.filter((u) => {
            const m = membros.find((x) => x.estudante_id === u.id);
            return !m || (editando !== 'nova' && m.equipe_id === editando.id);
          })}
          marcados={membros.filter((m) => editando !== 'nova' && m.equipe_id === editando.id).map((m) => m.estudante_id)}
        />
      )}
    </>
  );
}

type Pessoa = { id: number; nome: string };

function FormEquipe({ equipe, gestores, executores, estudantes, marcados }: {
  equipe?: Equipe; gestores: Pessoa[]; executores: Pessoa[]; estudantes: Pessoa[]; marcados: number[];
}) {
  const opcoes = (lista: Pessoa[]) => [
    <option key="" value="">Selecione...</option>,
    ...lista.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>),
  ];
  return (
    <section className="cartao">
      <h2>{equipe ? `${equipe.nome} — integrantes` : 'Nova equipe'}</h2>
      <form action={salvarEquipe}>
        <input type="hidden" name="id" value={equipe?.id ?? ''} />
        <div className="campos">
          <div><label>Nome</label><input name="nome" required defaultValue={equipe?.nome} /></div>
          <div><label>Cliente do projeto</label><input name="cliente" defaultValue={equipe?.cliente ?? ''} placeholder="Empresa ou instituição" /></div>
          <div><label>Orientador de gestão de projetos</label><select name="orient_gestao" required defaultValue={equipe?.orient_gestao_id ?? ''}>{opcoes(gestores)}</select></div>
          <div><label>Orientador de execução técnica</label><select name="orient_execucao" required defaultValue={equipe?.orient_execucao_id ?? ''}>{opcoes(executores)}</select></div>
          <div><label>Líder</label><select name="lider" required defaultValue={equipe?.lider_id ?? ''}>{opcoes(estudantes)}</select></div>
        </div>
        <label>Integrantes</label>
        {estudantes.length ? (
          <div className="opcoes" style={{ marginBottom: 14 }}>
            {estudantes.map((u) => (
              <label key={u.id}>
                <input type="checkbox" name="membros" value={u.id} defaultChecked={marcados.includes(u.id)} /> {u.nome}
              </label>
            ))}
          </div>
        ) : (
          <p className="suave">
            Todos os estudantes cadastrados já estão em alguma equipe. Importe novos estudantes na aba Estudantes.
          </p>
        )}
        <div className="linha">
          <button className="botao">Salvar equipe</button>
        </div>
      </form>
      {equipe && (
        <form action={excluirEquipe} style={{ marginTop: 10 }}>
          <input type="hidden" name="id" value={equipe.id} />
          <button className="botao secundario">Excluir equipe (apaga também as avaliações dela)</button>
        </form>
      )}
    </section>
  );
}

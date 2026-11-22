import { exigirPerfil } from '@/lib/auth';
import { query } from '@/lib/db';
import {
  cicloAtivo, dataBR, equipesDoUsuario, listarCriterios, listarEscala, membrosDaEquipe, num, valoresDoAvaliador,
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

// HU06 e HU08: o estudante avalia o projeto, a si mesmo e os colegas, e consulta só a própria nota
export default async function Estudante({ searchParams }: { searchParams: Promise<Busca> }) {
  const s = await exigirPerfil('estudante');
  const busca = await searchParams;
  const aba = busca.aba ?? 'projeto';
  const ciclo = await cicloAtivo();
  const [equipe] = ciclo ? await equipesDoUsuario(s, ciclo.id) : [];

  return (
    <>
      <Cabecalho
        subtitulo={
          ciclo && equipe
            ? `${equipe.nome} · janela de avaliação ${ciclo.janela_aberta ? 'aberta' : 'fechada'} até ${dataBR(ciclo.janela_fim)}`
            : 'Estudante'
        }
        usuario={s.nome}
      />
      <main className="conteudo">
        <Abas itens={ABAS} ativa={`/estudante?aba=${aba}`} />
        <Aviso busca={busca} />
        <section className="cartao">
          {aba === 'nota' ? (
            <MinhaNota estudanteId={s.id} />
          ) : !ciclo || !equipe ? (
            'Você ainda não está em uma equipe no ciclo atual.'
          ) : (
            <Avaliacao aba={aba} estudanteId={s.id} cicloId={ciclo.id} equipeId={equipe.id} bloqueado={!ciclo.janela_aberta} />
          )}
        </section>
      </main>
    </>
  );
}

async function Avaliacao(p: { aba: string; estudanteId: number; cicloId: number; equipeId: number; bloqueado: boolean }) {
  const [criterios, escala, membros, valores] = await Promise.all([
    listarCriterios(p.cicloId),
    listarEscala(p.cicloId),
    membrosDaEquipe(p.equipeId),
    valoresDoAvaliador(p.estudanteId, p.equipeId),
  ]);
  const comum = { equipeId: p.equipeId, volta: `/estudante?aba=${p.aba}`, escala, valores, bloqueado: p.bloqueado };
  const individuais = criterios.filter((c) => c.tipo === 'individual');

  if (p.aba === 'auto')
    return <FormAvaliacao {...comum} criterios={individuais} alvos={membros.filter((m) => m.id === p.estudanteId)} />;
  if (p.aba === 'colegas')
    return <FormAvaliacao {...comum} criterios={individuais} alvos={membros.filter((m) => m.id !== p.estudanteId)} />;
  return (
    <>
      <h2>Avaliação do projeto (notas de 0 a 10)</h2>
      <FormAvaliacao {...comum} alvos={[]} criterios={criterios.filter((c) => c.tipo === 'equipe' && c.fonte === 'estudante')} />
    </>
  );
}

// RN06: busca apenas o resultado do próprio estudante
async function MinhaNota({ estudanteId }: { estudanteId: number }) {
  const [r] = await query<{ semestre: string; fase: number; nota_equipe: number; cdi: number; nota_final: number }>(
    `select c.semestre, c.fase, r.nota_equipe, r.cdi, r.nota_final
     from resultado r join ciclo c on c.id = r.ciclo_id
     where r.estudante_id = $1 order by r.calculado_em desc limit 1`,
    [estudanteId],
  );
  if (!r) return <>Sua nota ainda não foi calculada pela coordenação.</>;
  return (
    <>
      <h2>Minha nota — Semestre {r.semestre}, Fase {r.fase}</h2>
      <table>
        <tbody>
          <tr><td>Nota da equipe</td><td className="num">{num(r.nota_equipe)}</td></tr>
          <tr><td>CDI</td><td className="num">{num(r.cdi)}</td></tr>
          <tr><td><strong>Nota final</strong></td><td className="num destaque">{num(r.nota_final)}</td></tr>
        </tbody>
      </table>
    </>
  );
}

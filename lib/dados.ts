import { query } from './db';
import { calcular, type ConfigCalculo, type LinhaAvaliacao, type Memoria, type Papel } from './calculo';
import type { Sessao } from './auth';

// Consultas e regras de negócio compartilhadas pelas telas.

export type Ciclo = {
  id: number;
  semestre: string;
  modalidade: string;
  fase: number;
  janela_inicio: string;
  janela_fim: string;
  peso_orient_gestao: number;
  peso_orient_execucao: number;
  peso_auto: number;
  peso_colegas: number;
  ativo: boolean;
  janela_aberta: boolean;
};

export type Criterio = { id: number; tipo: 'equipe' | 'individual'; nome: string; peso: number; fonte: string | null; ordem: number };
export type Equipe = {
  id: number;
  nome: string;
  lider_id: number | null;
  orient_gestao_id: number | null;
  orient_execucao_id: number | null;
};

// RN07: a janela é verificada na data de Brasília
const SELECT_CICLO = `
  select *, (now() at time zone 'America/Sao_Paulo')::date between janela_inicio and janela_fim as janela_aberta
  from ciclo`;

export const nomeCiclo = (c: Ciclo) => `Semestre ${c.semestre} · Fase ${c.fase} ${c.modalidade}`;
export const dataBR = (d: string) => d.split('-').reverse().join('/');
export const num = (n: number | null | undefined, casas = 2) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

// Acrescenta ?ok= ou ?erro= ao endereço, para a página mostrar o aviso
export const comAviso = (url: string, tipo: 'ok' | 'erro', texto: string) =>
  `${url}${url.includes('?') ? '&' : '?'}${tipo}=${encodeURIComponent(texto)}`;

export async function cicloAtivo(): Promise<Ciclo | null> {
  const [c] = await query<Ciclo>(`${SELECT_CICLO} where ativo`);
  return c ?? null;
}

export async function buscarCiclo(id: number): Promise<Ciclo | null> {
  const [c] = await query<Ciclo>(`${SELECT_CICLO} where id = $1`, [id]);
  return c ?? null;
}

export const listarCiclos = () => query<Ciclo>(`${SELECT_CICLO} order by semestre desc, modalidade, fase desc`);

export const listarCriterios = (cicloId: number) =>
  query<Criterio>('select * from criterio where ciclo_id = $1 order by tipo, ordem, id', [cicloId]);

export const listarEscala = (cicloId: number) =>
  query<{ id: number; rotulo: string; valor: number }>('select * from escala where ciclo_id = $1 order by valor', [cicloId]);

export const listarEquipes = (cicloId: number) =>
  query<Equipe>('select * from equipe where ciclo_id = $1 order by nome', [cicloId]);

export const membrosDaEquipe = (equipeId: number) =>
  query<{ id: number; nome: string }>(
    `select u.id, u.nome from membro m join usuario u on u.id = m.estudante_id
     where m.equipe_id = $1 order by u.nome`,
    [equipeId],
  );

export const usuariosPorPerfil = (perfil: string) =>
  query<{ id: number; nome: string; email: string; matricula: string | null }>(
    'select id, nome, email, matricula from usuario where perfil = $1 order by nome',
    [perfil],
  );

// RN05: equipes que o usuário pode ver e avaliar no ciclo
export async function equipesDoUsuario(s: Sessao, cicloId: number): Promise<Equipe[]> {
  if (s.perfil === 'orientador')
    return query<Equipe>(
      'select * from equipe where ciclo_id = $1 and $2 in (orient_gestao_id, orient_execucao_id) order by nome',
      [cicloId, s.id],
    );
  return query<Equipe>(
    `select e.* from equipe e join membro m on m.equipe_id = e.id
     where e.ciclo_id = $1 and m.estudante_id = $2`,
    [cicloId, s.id],
  );
}

// RN05: define o papel do avaliador, ou null se ele não puder avaliar aquele alvo
export function papelPermitido(
  s: Sessao,
  equipe: Equipe,
  membros: number[],
  avaliadoId: number | null,
  criterio: Criterio,
): Papel | null {
  const alvoValido =
    avaliadoId === null ? criterio.tipo === 'equipe' : criterio.tipo === 'individual' && membros.includes(avaliadoId);
  if (!alvoValido) return null;

  if (s.perfil === 'orientador') {
    if (avaliadoId === null && criterio.fonte !== 'orientador') return null;
    if (equipe.orient_gestao_id === s.id) return 'orient_gestao';
    if (equipe.orient_execucao_id === s.id) return 'orient_execucao';
    return null;
  }
  if (s.perfil === 'estudante' && membros.includes(s.id)) {
    if (avaliadoId === null) return criterio.fonte === 'estudante' ? 'projeto' : null;
    return avaliadoId === s.id ? 'auto' : 'colega';
  }
  return null;
}

// Avaliações já registradas por um avaliador, no formato "avaliado|criterio" -> valor
export async function valoresDoAvaliador(avaliadorId: number, equipeId: number) {
  const linhas = await query<{ avaliado_id: number | null; criterio_id: number; valor: number }>(
    'select avaliado_id, criterio_id, valor from avaliacao where avaliador_id = $1 and equipe_id = $2',
    [avaliadorId, equipeId],
  );
  return new Map(linhas.map((l) => [`${l.avaliado_id ?? ''}|${l.criterio_id}`, l.valor]));
}

// Report CSV: todas as avaliações brutas do ciclo, com nomes para leitura humana
export type LinhaRelatorio = LinhaAvaliacao & {
  equipe: string;
  avaliador: string;
  avaliado: string | null;
  criterio: string;
  tipo: string;
  atualizado_em: string;
};

export const relatorioAvaliacoes = (cicloId: number) =>
  query<LinhaRelatorio>(
    `select a.equipe_id, e.nome as equipe, a.avaliador_id, ua.nome as avaliador, a.papel,
            a.avaliado_id, uv.nome as avaliado, a.criterio_id, c.nome as criterio, c.tipo, a.valor,
            to_char(a.atualizado_em, 'YYYY-MM-DD HH24:MI') as atualizado_em
     from avaliacao a
     join equipe e on e.id = a.equipe_id
     join usuario ua on ua.id = a.avaliador_id
     left join usuario uv on uv.id = a.avaliado_id
     join criterio c on c.id = a.criterio_id
     where a.ciclo_id = $1
     order by e.nome, uv.nome nulls first, c.tipo, c.ordem, a.papel`,
    [cicloId],
  );

async function configCalculo(c: Ciclo): Promise<ConfigCalculo> {
  const membros = await query<{ equipe_id: number; estudante_id: number }>(
    'select equipe_id, estudante_id from membro where ciclo_id = $1',
    [c.id],
  );
  return {
    criterios: await listarCriterios(c.id),
    pesosFontes: {
      orient_gestao: c.peso_orient_gestao,
      orient_execucao: c.peso_orient_execucao,
      auto: c.peso_auto,
      colega: c.peso_colegas,
    },
    equipes: (await listarEquipes(c.id)).map((e) => ({
      id: e.id,
      membros: membros.filter((m) => m.equipe_id === e.id).map((m) => m.estudante_id),
    })),
  };
}

// RF06: o motor recebe o report de avaliações e a configuração do ciclo
export async function calcularCiclo(c: Ciclo) {
  return calcular(await relatorioAvaliacoes(c.id), await configCalculo(c));
}

export type ResultadoLinha = {
  estudante_id: number;
  estudante: string;
  matricula: string | null;
  equipe_id: number;
  equipe: string;
  nota_equipe: number;
  conceito: number;
  cdi: number;
  nota_final: number;
  memoria: Memoria;
};

export const listarResultados = (cicloId: number) =>
  query<ResultadoLinha>(
    `select r.*, u.nome as estudante, u.matricula, e.nome as equipe
     from resultado r join usuario u on u.id = r.estudante_id join equipe e on e.id = r.equipe_id
     where r.ciclo_id = $1 order by e.nome, u.nome`,
    [cicloId],
  );

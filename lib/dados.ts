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
  // janelas do estudante (datas vazias = fechado)
  auto_inicio: string | null;
  auto_fim: string | null;
  colegas_inicio: string | null;
  colegas_fim: string | null;
  nota_liberada_em: string | null;
  auto_aberta: boolean;
  colegas_aberta: boolean;
  nota_liberada: boolean;
};

export type Criterio = {
  id: number;
  tipo: 'equipe' | 'individual';
  nome: string; // título curto (aparece em relatórios e na planilha)
  descricao: string | null; // texto completo da pergunta
  descricao_auto: string | null; // versão em primeira pessoa, para a autoavaliação
  ancora_min: string | null; // frase da ponta mais baixa da escala (projeto e autoavaliação)
  ancora_max: string | null; // frase da ponta mais alta
  peso: number;
  fonte: string | null;
  ordem: number;
};
export type Equipe = {
  id: number;
  nome: string;
  lider_id: number | null;
  cliente: string | null;
  orient_gestao_id: number | null;
  orient_execucao_id: number | null;
};

// RN07: as janelas são verificadas na data de Brasília
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const SELECT_CICLO = `
  select *,
    ${HOJE} between janela_inicio and janela_fim as janela_aberta,
    coalesce(${HOJE} between auto_inicio and auto_fim, false) as auto_aberta,
    coalesce(${HOJE} between colegas_inicio and colegas_fim, false) as colegas_aberta,
    coalesce(${HOJE} >= nota_liberada_em, false) as nota_liberada
  from ciclo`;

export const nomeCiclo = (c: Ciclo) => `Semestre ${c.semestre} · Fase ${c.fase} ${c.modalidade}`;
export const dataBR = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
export const periodoBR = (inicio: string | null, fim: string | null) =>
  inicio && fim ? `de ${dataBR(inicio)} a ${dataBR(fim)}` : 'ainda não liberado';
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
  query<{ id: number; nome: string; email: string; matricula: string | null; curso: string | null }>(
    'select id, nome, email, matricula, curso from usuario where perfil = $1 order by nome',
    [perfil],
  );

// RN05: equipes que o usuário pode ver e avaliar no ciclo
export async function equipesDoUsuario(s: Sessao, cicloId: number): Promise<Equipe[]> {
  if (s.perfil === 'gestao' || s.perfil === 'execucao')
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

// Critérios avaliados na escala de conceitos (os demais recebem nota de 0 a 10):
// os individuais e as perguntas do estudante sobre o projeto (formulário 360º usa 1 a 5)
export const usaEscala = (c: Pick<Criterio, 'tipo' | 'fonte'>) => c.tipo === 'individual' || c.fonte === 'estudante';

// Critérios que cada avaliador responde
export function criteriosDoAvaliador(criterios: Criterio[], quem: 'gestao' | 'execucao' | 'estudante') {
  const daFonte = (f: string | null) =>
    f === null || f === quem || (f === 'orientador' && quem !== 'estudante') || (f === 'cliente' && quem === 'gestao');
  return {
    equipe: criterios.filter((c) => c.tipo === 'equipe' && c.fonte !== null && daFonte(c.fonte)),
    individual: criterios.filter((c) => c.tipo === 'individual' && daFonte(c.fonte)),
  };
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

  const f = criterio.fonte;
  if (s.perfil === 'gestao' && equipe.orient_gestao_id === s.id) {
    if (f === 'cliente') return 'cliente';
    return f === null || f === 'orientador' || f === 'gestao' ? 'orient_gestao' : null;
  }
  if (s.perfil === 'execucao' && equipe.orient_execucao_id === s.id) {
    return f === null || f === 'orientador' || f === 'execucao' ? 'orient_execucao' : null;
  }
  if (s.perfil === 'estudante' && membros.includes(s.id)) {
    if (f !== null && f !== 'estudante') return null;
    if (avaliadoId === null) return 'projeto';
    return avaliadoId === s.id ? 'auto' : 'colega';
  }
  return null;
}

// Janela que vale para cada papel (RN07)
export function janelaAberta(c: Ciclo, papel: Papel) {
  if (papel === 'projeto' || papel === 'auto') return c.auto_aberta;
  if (papel === 'colega') return c.colegas_aberta;
  return c.janela_aberta;
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
  curso: string | null;
  equipe_id: number;
  equipe: string;
  nota_equipe: number;
  conceito: number;
  cdi: number;
  nota_final: number;
  memoria: Memoria;
  calculado_em?: string;
};

export const listarResultados = (cicloId: number) =>
  query<ResultadoLinha>(
    `select r.*, u.nome as estudante, u.matricula, u.curso, e.nome as equipe
     from resultado r join usuario u on u.id = r.estudante_id join equipe e on e.id = r.equipe_id
     where r.ciclo_id = $1 order by e.nome, u.nome`,
    [cicloId],
  );

// Comentários livres (formulário 360º): projeto | auto | geral | colegas:<criterio_id>
export const TIPO_COMENTARIO = /^(projeto|auto|geral|colegas:\d+)$/;

export async function comentariosDoAvaliador(avaliadorId: number, equipeId: number) {
  const linhas = await query<{ tipo: string; texto: string }>(
    'select tipo, texto from comentario where avaliador_id = $1 and equipe_id = $2',
    [avaliadorId, equipeId],
  );
  return new Map(linhas.map((l) => [l.tipo, l.texto]));
}

// Sem o nome do autor: a avaliação é confidencial
export async function comentariosDoCiclo(cicloId: number) {
  const [linhas, criterios] = await Promise.all([
    query<{ equipe_id: number; equipe: string; tipo: string; texto: string }>(
      `select c.equipe_id, e.nome as equipe, c.tipo, c.texto from comentario c join equipe e on e.id = c.equipe_id
       where c.ciclo_id = $1 order by e.nome, c.tipo, c.atualizado_em`,
      [cicloId],
    ),
    listarCriterios(cicloId),
  ]);
  const rotulo = (tipo: string) => {
    if (tipo === 'projeto') return 'Trabalho em equipe';
    if (tipo === 'auto') return 'Autoavaliação';
    if (tipo === 'geral') return 'Comentários gerais (projeto, metodologia, orientação, trilha, cliente)';
    const c = criterios.find((x) => `colegas:${x.id}` === tipo);
    return `Avaliação cruzada — ${c?.nome ?? 'questão removida'}`;
  };
  return linhas.map((l) => ({ ...l, rotulo: rotulo(l.tipo) }));
}

// Acompanhamento do preenchimento: o que cada avaliador deveria ter respondido x o que respondeu
export type Pendencia = {
  equipe_id: number;
  equipe: string;
  avaliador_id: number;
  avaliador: string;
  papel: string; // descrição do papel do avaliador
  esperado: number;
  feito: number;
};

export async function acompanhamento(c: Ciclo): Promise<Pendencia[]> {
  const [criterios, equipes, membros, feitos, usuarios] = await Promise.all([
    listarCriterios(c.id),
    listarEquipes(c.id),
    query<{ equipe_id: number; estudante_id: number }>('select equipe_id, estudante_id from membro where ciclo_id = $1', [c.id]),
    query<{ equipe_id: number; avaliador_id: number; total: number }>(
      'select equipe_id, avaliador_id, count(*)::int as total from avaliacao where ciclo_id = $1 group by 1, 2',
      [c.id],
    ),
    query<{ id: number; nome: string }>('select id, nome from usuario'),
  ]);
  const nome = (id: number) => usuarios.find((u) => u.id === id)?.nome ?? '—';
  const feito = (equipeId: number, avaliadorId: number) =>
    feitos.find((f) => f.equipe_id === equipeId && f.avaliador_id === avaliadorId)?.total ?? 0;

  const linhas: Pendencia[] = [];
  for (const e of equipes) {
    const integrantes = membros.filter((m) => m.equipe_id === e.id).map((m) => m.estudante_id);
    const n = integrantes.length;
    const add = (avaliadorId: number | null, papel: string, esperado: number) => {
      if (avaliadorId && esperado > 0)
        linhas.push({ equipe_id: e.id, equipe: e.nome, avaliador_id: avaliadorId, avaliador: nome(avaliadorId), papel, esperado, feito: Math.min(feito(e.id, avaliadorId), esperado) });
    };
    const g = criteriosDoAvaliador(criterios, 'gestao');
    const x = criteriosDoAvaliador(criterios, 'execucao');
    const est = criteriosDoAvaliador(criterios, 'estudante');
    add(e.orient_gestao_id, 'Orientador de gestão', g.equipe.length + g.individual.length * n);
    add(e.orient_execucao_id, 'Orientador de execução', x.equipe.length + x.individual.length * n);
    // cada estudante: projeto + autoavaliação + colegas
    for (const m of integrantes) add(m, 'Estudante', est.equipe.length + est.individual.length * n);
  }
  return linhas;
}

// Quem vê quais equipes nos resultados e no acompanhamento (reunião de 24/11):
// a coordenação vê 100% das equipes; cada orientador (gestão ou execução), só as que orienta.
export async function equipesVisiveis(s: Sessao, cicloId: number): Promise<Equipe[]> {
  if (s.perfil === 'coordenacao') return listarEquipes(cicloId);
  if (s.perfil === 'gestao')
    return query<Equipe>('select * from equipe where ciclo_id = $1 and orient_gestao_id = $2 order by nome', [cicloId, s.id]);
  if (s.perfil === 'execucao')
    return query<Equipe>('select * from equipe where ciclo_id = $1 and orient_execucao_id = $2 order by nome', [cicloId, s.id]);
  return [];
}

// Integrantes de todas as equipes do ciclo, com os dados de identificação
export const integrantesDoCiclo = (cicloId: number) =>
  query<{ equipe_id: number; id: number; nome: string; matricula: string | null; curso: string | null }>(
    `select m.equipe_id, u.id, u.nome, u.matricula, u.curso from membro m join usuario u on u.id = m.estudante_id
     where m.ciclo_id = $1 order by u.nome`,
    [cicloId],
  );

// Prévia: roda o motor com as avaliações atuais, sem gravar (para ver as notas antes de "Calcular notas")
export async function previaResultados(c: Ciclo): Promise<ResultadoLinha[]> {
  const [calculo, integrantes, equipes] = await Promise.all([calcularCiclo(c), integrantesDoCiclo(c.id), listarEquipes(c.id)]);
  return calculo.map((r) => {
    const u = integrantes.find((i) => i.id === r.estudante_id);
    return {
      ...r,
      estudante: u?.nome ?? '—',
      matricula: u?.matricula ?? null,
      curso: u?.curso ?? null,
      equipe: equipes.find((e) => e.id === r.equipe_id)?.nome ?? '—',
    };
  });
}

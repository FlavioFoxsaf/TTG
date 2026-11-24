'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import Papa from 'papaparse';
import { auditar, query, transacao } from '@/lib/db';
import { exigirPerfil } from '@/lib/auth';
import { errosDePeso, type Fonte } from '@/lib/calculo';
import { buscarCiclo, calcularCiclo, cicloAtivo, comAviso, listarCriterios, listarEscala, type Ciclo } from '@/lib/dados';

const texto = (form: FormData, campo: string) => String(form.get(campo) ?? '').trim();
const numero = (form: FormData, campo: string) => Number(texto(form, campo).replace(',', '.'));
const dataOuNulo = (form: FormData, campo: string) => texto(form, campo) || null;

const pesosDoCiclo = (c: Pick<Ciclo, 'peso_orient_gestao' | 'peso_orient_execucao' | 'peso_auto' | 'peso_colegas'>): Record<Fonte, number> => ({
  orient_gestao: c.peso_orient_gestao,
  orient_execucao: c.peso_orient_execucao,
  auto: c.peso_auto,
  colega: c.peso_colegas,
});

async function exigirCicloAtivo(volta: string) {
  const ciclo = await cicloAtivo();
  if (!ciclo) redirect(comAviso(volta, 'erro', 'Crie um ciclo avaliativo na aba Configuração.'));
  return ciclo;
}

// Aceita o nome do perfil escrito de formas diferentes no CSV
const PERFIS_CSV: Record<string, string> = {
  estudante: 'estudante',
  aluno: 'estudante',
  gestao: 'gestao',
  'gestão': 'gestao',
  'orientador de gestão': 'gestao',
  'orientador de gestao': 'gestao',
  orientador_gestao: 'gestao',
  execucao: 'execucao',
  'execução': 'execucao',
  'orientador de execução': 'execucao',
  'orientador de execucao': 'execucao',
  orientador_execucao: 'execucao',
};

// RF01 / HU01: importa CSV com colunas nome, email, matricula e, opcionalmente, perfil e curso.
// A senha inicial é a matrícula. Linhas com erro são listadas sem interromper as demais.
export async function importarUsuarios(form: FormData) {
  const s = await exigirPerfil('gestao');
  const arquivo = form.get('arquivo') as File;
  const { data } = Papa.parse<Record<string, string>>(await arquivo.text(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  let importados = 0;
  const erros: string[] = [];
  for (const [i, l] of data.entries()) {
    const linha = `Linha ${i + 2}`;
    const nome = l.nome?.trim();
    const email = l.email?.trim().toLowerCase();
    const matricula = l.matricula?.trim();
    const curso = l.curso?.trim() || null;
    const informado = l.perfil?.trim().toLowerCase() || 'estudante';
    const perfil = PERFIS_CSV[informado];

    if (!nome || !email?.includes('@') || !matricula) {
      erros.push(`${linha}: nome, e-mail e matrícula são obrigatórios.`);
      continue;
    }
    if (!perfil) {
      erros.push(`${linha}: perfil "${informado}" inválido (use estudante, gestao ou execucao).`);
      continue;
    }
    try {
      await query(
        `insert into usuario (nome, email, matricula, perfil, curso, senha_hash) values ($1, $2, $3, $4, $5, $6)
         on conflict (email) do update set nome = excluded.nome, matricula = excluded.matricula, perfil = excluded.perfil,
           curso = coalesce(excluded.curso, usuario.curso)`,
        [nome, email, matricula, perfil, curso, await bcrypt.hash(matricula, 10)],
      );
      importados++;
    } catch (e) {
      erros.push(`${linha}: ${(e as Error).message}`);
    }
  }
  await auditar(s.id, 'importacao', `${importados} importados, ${erros.length} com erro`);

  const resumo = `${importados} registro(s) importado(s).`;
  if (!erros.length) redirect(comAviso('/painel/estudantes', 'ok', resumo));
  const lista = erros.slice(0, 10).join('\n') + (erros.length > 10 ? `\n... e mais ${erros.length - 10}` : '');
  redirect(comAviso('/painel/estudantes', 'erro', `${resumo} ${erros.length} com erro:\n${lista}`));
}

// RF02 / HU02: cria ou altera uma equipe e seus integrantes
export async function salvarEquipe(form: FormData) {
  const s = await exigirPerfil('gestao');
  const id = Number(form.get('id')) || null;
  const volta = `/painel/equipes?editar=${id ?? 'nova'}`;
  const ciclo = await exigirCicloAtivo(volta);

  const nome = texto(form, 'nome');
  const cliente = texto(form, 'cliente') || null;
  const lider = Number(form.get('lider'));
  const gestao = Number(form.get('orient_gestao'));
  const execucao = Number(form.get('orient_execucao'));
  const membros = form.getAll('membros').map(Number);

  if (!nome || !gestao || !execucao) redirect(comAviso(volta, 'erro', 'Informe o nome e os dois orientadores.'));
  if (!membros.includes(lider)) redirect(comAviso(volta, 'erro', 'O líder precisa ser um dos integrantes marcados.'));

  try {
    await transacao(async (q) => {
      const [e] = id
        ? await q(
            `update equipe set nome = $1, cliente = $2, lider_id = $3, orient_gestao_id = $4, orient_execucao_id = $5
             where id = $6 and ciclo_id = $7 returning id`,
            [nome, cliente, lider, gestao, execucao, id, ciclo.id],
          )
        : await q(
            `insert into equipe (ciclo_id, nome, cliente, lider_id, orient_gestao_id, orient_execucao_id)
             values ($1, $2, $3, $4, $5, $6) returning id`,
            [ciclo.id, nome, cliente, lider, gestao, execucao],
          );
      await q('delete from membro where equipe_id = $1', [e.id]);
      for (const m of membros) {
        await q('insert into membro (ciclo_id, equipe_id, estudante_id) values ($1, $2, $3)', [ciclo.id, e.id, m]);
      }
    });
  } catch {
    // a chave (ciclo, estudante) impede o mesmo estudante em duas equipes
    redirect(comAviso(volta, 'erro', 'Algum integrante já pertence a outra equipe neste semestre.'));
  }
  await auditar(s.id, 'equipe', `${nome}: ${membros.length} integrantes`);
  redirect(comAviso('/painel/equipes', 'ok', `Equipe ${nome} salva.`));
}

export async function excluirEquipe(form: FormData) {
  const s = await exigirPerfil('gestao');
  await query('delete from equipe where id = $1', [Number(form.get('id'))]);
  await auditar(s.id, 'equipe excluída', String(form.get('id')));
  redirect(comAviso('/painel/equipes', 'ok', 'Equipe excluída.'));
}

// RF04 / HU04: dados do ciclo ativo, janelas e pesos das fontes
export async function salvarCiclo(form: FormData) {
  const s = await exigirPerfil('gestao');
  const volta = '/painel/configuracao';
  const ciclo = await exigirCicloAtivo(volta);
  const pesos = {
    peso_orient_gestao: numero(form, 'peso_orient_gestao'),
    peso_orient_execucao: numero(form, 'peso_orient_execucao'),
    peso_auto: numero(form, 'peso_auto'),
    peso_colegas: numero(form, 'peso_colegas'),
  };
  // Bloqueia se os pesos das fontes não fecham 100% (os critérios são conferidos no seu próprio formulário)
  const erros = errosDePeso([], pesosDoCiclo(pesos)).filter((e) => e.includes('quatro fontes') || e.includes('inválidos'));
  if (erros.length) redirect(comAviso(volta, 'erro', `Configuração não salva. ${erros.join(' ')}`));

  const periodos: [string, string, string][] = [
    ['janela_inicio', 'janela_fim', 'orientadores'],
    ['auto_inicio', 'auto_fim', 'projeto e autoavaliação'],
    ['colegas_inicio', 'colegas_fim', 'avaliação dos colegas'],
  ];
  for (const [ini, fim, nome] of periodos) {
    const a = texto(form, ini), b = texto(form, fim);
    if ((a && !b) || (!a && b)) redirect(comAviso(volta, 'erro', `Informe início e fim do período de ${nome}, ou deixe os dois vazios.`));
    if (a && b && a > b) redirect(comAviso(volta, 'erro', `O período de ${nome} termina antes de começar.`));
  }

  await query(
    `update ciclo set semestre = $1, modalidade = $2, fase = $3, janela_inicio = $4, janela_fim = $5,
       peso_orient_gestao = $6, peso_orient_execucao = $7, peso_auto = $8, peso_colegas = $9,
       auto_inicio = $10, auto_fim = $11, colegas_inicio = $12, colegas_fim = $13, nota_liberada_em = $14
     where id = $15`,
    [
      texto(form, 'semestre'), texto(form, 'modalidade'), numero(form, 'fase'),
      texto(form, 'janela_inicio'), texto(form, 'janela_fim'),
      pesos.peso_orient_gestao, pesos.peso_orient_execucao, pesos.peso_auto, pesos.peso_colegas,
      dataOuNulo(form, 'auto_inicio'), dataOuNulo(form, 'auto_fim'),
      dataOuNulo(form, 'colegas_inicio'), dataOuNulo(form, 'colegas_fim'),
      dataOuNulo(form, 'nota_liberada_em'), ciclo.id,
    ],
  );
  await auditar(s.id, 'configuração', `ciclo ${ciclo.id}`);
  redirect(comAviso(volta, 'ok', 'Configuração salva.'));
}

// Critérios: edita os existentes (campos "nome_ID", "peso_ID"...) e adiciona um novo, se preenchido.
// Só grava se os pesos fecharem 100% em cada grupo.
export async function salvarCriterios(form: FormData) {
  const s = await exigirPerfil('gestao');
  const volta = '/painel/configuracao';
  const ciclo = await exigirCicloAtivo(volta);
  const atuais = await listarCriterios(ciclo.id);

  // individual com fonte vazia = avaliado por todos (orientadores, autoavaliação e colegas)
  const fonteValida = (tipo: string, f: string | null) =>
    tipo === 'equipe'
      ? f !== null && ['orientador', 'gestao', 'execucao', 'estudante', 'cliente'].includes(f)
      : f === null || ['orientador', 'gestao', 'execucao', 'estudante'].includes(f);

  const mantidos = atuais
    .filter((c) => !form.get(`remover_${c.id}`))
    .map((c) => ({
      id: c.id,
      tipo: c.tipo,
      nome: texto(form, `nome_${c.id}`),
      peso: numero(form, `peso_${c.id}`),
      fonte: texto(form, `fonte_${c.id}`) || null,
      ordem: numero(form, `ordem_${c.id}`) || 0,
      descricao: texto(form, `descricao_${c.id}`) || null,
      descricao_auto: c.tipo === 'individual' ? texto(form, `descricao_auto_${c.id}`) || null : null,
      ancora_min: texto(form, `ancora_min_${c.id}`) || null,
      ancora_max: texto(form, `ancora_max_${c.id}`) || null,
    }));
  const novo = texto(form, 'novo_nome')
    ? { tipo: texto(form, 'novo_tipo') as 'equipe' | 'individual', nome: texto(form, 'novo_nome'), peso: numero(form, 'novo_peso'), fonte: texto(form, 'novo_fonte') || null }
    : null;

  const todos = [...mantidos, ...(novo ? [novo] : [])];
  if (todos.some((c) => !c.nome || !fonteValida(c.tipo, c.fonte)))
    redirect(comAviso(volta, 'erro', 'Critérios não salvos: todo critério precisa de nome e de quem avalia (a nota do cliente só vale para a equipe).'));
  const erros = errosDePeso(todos, pesosDoCiclo(ciclo)).filter((e) => !e.includes('quatro fontes'));
  if (erros.length) redirect(comAviso(volta, 'erro', `Critérios não salvos. ${erros.join(' ')}`));

  await transacao(async (q) => {
    for (const c of atuais) {
      if (form.get(`remover_${c.id}`)) await q('delete from criterio where id = $1', [c.id]);
    }
    for (const c of mantidos) {
      await q(
        `update criterio set nome = $1, peso = $2, fonte = $3, ordem = $4, descricao = $5, descricao_auto = $6,
           ancora_min = $7, ancora_max = $8 where id = $9`,
        [c.nome, c.peso, c.fonte, c.ordem, c.descricao, c.descricao_auto, c.ancora_min, c.ancora_max, c.id],
      );
    }
    if (novo) {
      await q('insert into criterio (ciclo_id, tipo, nome, peso, fonte, ordem, descricao) values ($1, $2, $3, $4, $5, 99, $6)', [
        ciclo.id, novo.tipo, novo.nome, novo.peso, novo.fonte, texto(form, 'novo_descricao') || null,
      ]);
    }
  });
  await auditar(s.id, 'critérios', `ciclo ${ciclo.id}`);
  redirect(comAviso(volta, 'ok', 'Critérios salvos.'));
}

// Escala de conceitos (RN08)
export async function salvarEscala(form: FormData) {
  const s = await exigirPerfil('gestao');
  const ciclo = await exigirCicloAtivo('/painel/configuracao');
  await transacao(async (q) => {
    for (const e of await listarEscala(ciclo.id)) {
      if (form.get(`remover_${e.id}`)) await q('delete from escala where id = $1', [e.id]);
      else await q('update escala set rotulo = $1, valor = $2 where id = $3', [texto(form, `rotulo_${e.id}`), numero(form, `valor_${e.id}`), e.id]);
    }
    if (texto(form, 'novo_rotulo')) {
      await q('insert into escala (ciclo_id, rotulo, valor) values ($1, $2, $3)', [ciclo.id, texto(form, 'novo_rotulo'), numero(form, 'novo_valor')]);
    }
  });
  await auditar(s.id, 'escala', `ciclo ${ciclo.id}`);
  redirect(comAviso('/painel/configuracao', 'ok', 'Escala salva.'));
}

// Novo ciclo: copia pesos, critérios e escala do ciclo ativo e passa a ser o ativo.
// As janelas do estudante começam vazias (fechadas) até a gestão liberar.
export async function novoCiclo(form: FormData) {
  const s = await exigirPerfil('gestao');
  const anterior = await cicloAtivo();
  try {
    await transacao(async (q) => {
      const [c] = await q(
        `insert into ciclo (semestre, modalidade, fase, janela_inicio, janela_fim,
           peso_orient_gestao, peso_orient_execucao, peso_auto, peso_colegas)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [
          texto(form, 'semestre'), texto(form, 'modalidade'), numero(form, 'fase'),
          texto(form, 'janela_inicio'), texto(form, 'janela_fim'),
          anterior?.peso_orient_gestao ?? 25, anterior?.peso_orient_execucao ?? 25,
          anterior?.peso_auto ?? 25, anterior?.peso_colegas ?? 25,
        ],
      );
      if (anterior) {
        await q(
          `insert into criterio (ciclo_id, tipo, nome, peso, fonte, ordem, descricao, descricao_auto, ancora_min, ancora_max)
           select $1, tipo, nome, peso, fonte, ordem, descricao, descricao_auto, ancora_min, ancora_max
           from criterio where ciclo_id = $2`,
          [c.id, anterior.id],
        );
        await q('insert into escala (ciclo_id, rotulo, valor) select $1, rotulo, valor from escala where ciclo_id = $2', [c.id, anterior.id]);
      }
      await q('update ciclo set ativo = (id = $1)', [c.id]);
    });
  } catch {
    redirect(comAviso('/painel/configuracao', 'erro', 'Já existe um ciclo com esse semestre, modalidade e fase.'));
  }
  await auditar(s.id, 'novo ciclo', texto(form, 'semestre'));
  redirect(comAviso('/painel/configuracao', 'ok', 'Novo ciclo criado e ativado.'));
}

export async function ativarCiclo(form: FormData) {
  const s = await exigirPerfil('gestao');
  await query('update ciclo set ativo = (id = $1)', [Number(form.get('id'))]);
  await auditar(s.id, 'ciclo ativado', String(form.get('id')));
  redirect(comAviso('/painel/historico', 'ok', 'Ciclo ativado.'));
}

// RF06 / HU07: roda o motor de cálculo e grava os resultados com a memória de cálculo
export async function calcularNotas(form: FormData) {
  const s = await exigirPerfil('gestao', 'coordenacao');
  const ciclo = await buscarCiclo(Number(form.get('ciclo')));
  if (!ciclo) redirect('/painel/resultados');
  const volta = `/painel/resultados?ciclo=${ciclo.id}`;

  // Não calcula com pesos que não fecham 100%
  const erros = errosDePeso(await listarCriterios(ciclo.id), pesosDoCiclo(ciclo));
  if (erros.length) redirect(comAviso(volta, 'erro', `Corrija a configuração antes de calcular. ${erros.join(' ')}`));

  const resultados = await calcularCiclo(ciclo);
  await transacao(async (q) => {
    await q('delete from resultado where ciclo_id = $1', [ciclo.id]);
    for (const r of resultados) {
      await q(
        `insert into resultado (ciclo_id, estudante_id, equipe_id, nota_equipe, conceito, cdi, nota_final, memoria)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ciclo.id, r.estudante_id, r.equipe_id, r.nota_equipe, r.conceito, r.cdi, r.nota_final, JSON.stringify(r.memoria)],
      );
    }
  });
  await auditar(s.id, 'cálculo', `ciclo ${ciclo.id}: ${resultados.length} estudantes`);
  redirect(comAviso(volta, 'ok', `Notas calculadas para ${resultados.length} estudante(s).`));
}

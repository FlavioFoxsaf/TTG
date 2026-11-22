'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import Papa from 'papaparse';
import { auditar, query, transacao } from '@/lib/db';
import { exigirPerfil } from '@/lib/auth';
import { buscarCiclo, calcularCiclo, cicloAtivo, comAviso, listarCriterios, listarEscala } from '@/lib/dados';

const texto = (form: FormData, campo: string) => String(form.get(campo) ?? '').trim();
const numero = (form: FormData, campo: string) => Number(texto(form, campo).replace(',', '.'));

async function exigirCicloAtivo(volta: string) {
  const ciclo = await cicloAtivo();
  if (!ciclo) redirect(comAviso(volta, 'erro', 'Crie um ciclo avaliativo na aba Configuração.'));
  return ciclo;
}

// RF01 / HU01: importa CSV com colunas nome, email, matricula e, opcionalmente, perfil.
// A senha inicial é a matrícula. Linhas com erro são listadas sem interromper as demais.
export async function importarUsuarios(form: FormData) {
  const s = await exigirPerfil('coordenacao');
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
    const perfil = l.perfil?.trim().toLowerCase() || 'estudante';

    if (!nome || !email?.includes('@') || !matricula) {
      erros.push(`${linha}: nome, e-mail e matrícula são obrigatórios.`);
      continue;
    }
    if (perfil !== 'estudante' && perfil !== 'orientador') {
      erros.push(`${linha}: perfil "${perfil}" inválido (use estudante ou orientador).`);
      continue;
    }
    try {
      await query(
        `insert into usuario (nome, email, matricula, perfil, senha_hash) values ($1, $2, $3, $4, $5)
         on conflict (email) do update set nome = excluded.nome, matricula = excluded.matricula`,
        [nome, email, matricula, perfil, await bcrypt.hash(matricula, 10)],
      );
      importados++;
    } catch (e) {
      erros.push(`${linha}: ${(e as Error).message}`);
    }
  }
  await auditar(s.id, 'importacao', `${importados} importados, ${erros.length} com erro`);

  const resumo = `${importados} registro(s) importado(s).`;
  if (!erros.length) redirect(comAviso('/coordenacao/estudantes', 'ok', resumo));
  const lista = erros.slice(0, 10).join('\n') + (erros.length > 10 ? `\n... e mais ${erros.length - 10}` : '');
  redirect(comAviso('/coordenacao/estudantes', 'erro', `${resumo} ${erros.length} com erro:\n${lista}`));
}

// RF02 / HU02: cria ou altera uma equipe e seus integrantes
export async function salvarEquipe(form: FormData) {
  const s = await exigirPerfil('coordenacao');
  const id = Number(form.get('id')) || null;
  const volta = `/coordenacao/equipes?editar=${id ?? 'nova'}`;
  const ciclo = await exigirCicloAtivo(volta);

  const nome = texto(form, 'nome');
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
            `update equipe set nome = $1, lider_id = $2, orient_gestao_id = $3, orient_execucao_id = $4
             where id = $5 and ciclo_id = $6 returning id`,
            [nome, lider, gestao, execucao, id, ciclo.id],
          )
        : await q(
            `insert into equipe (ciclo_id, nome, lider_id, orient_gestao_id, orient_execucao_id)
             values ($1, $2, $3, $4, $5) returning id`,
            [ciclo.id, nome, lider, gestao, execucao],
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
  redirect(comAviso('/coordenacao/equipes', 'ok', `Equipe ${nome} salva.`));
}

export async function excluirEquipe(form: FormData) {
  const s = await exigirPerfil('coordenacao');
  await query('delete from equipe where id = $1', [Number(form.get('id'))]);
  await auditar(s.id, 'equipe excluída', String(form.get('id')));
  redirect(comAviso('/coordenacao/equipes', 'ok', 'Equipe excluída.'));
}

// RF04 / HU04: dados do ciclo ativo, janela e pesos das fontes
export async function salvarCiclo(form: FormData) {
  const s = await exigirPerfil('coordenacao');
  const ciclo = await exigirCicloAtivo('/coordenacao/configuracao');
  await query(
    `update ciclo set semestre = $1, modalidade = $2, fase = $3, janela_inicio = $4, janela_fim = $5,
       peso_orient_gestao = $6, peso_orient_execucao = $7, peso_auto = $8, peso_colegas = $9
     where id = $10`,
    [
      texto(form, 'semestre'), texto(form, 'modalidade'), numero(form, 'fase'),
      texto(form, 'janela_inicio'), texto(form, 'janela_fim'),
      numero(form, 'peso_orient_gestao'), numero(form, 'peso_orient_execucao'),
      numero(form, 'peso_auto'), numero(form, 'peso_colegas'), ciclo.id,
    ],
  );
  await auditar(s.id, 'configuração', `ciclo ${ciclo.id}`);
  redirect(comAviso('/coordenacao/configuracao', 'ok', 'Configuração salva.'));
}

// Critérios: edita os existentes (campos "nome_ID", "peso_ID"...) e adiciona um novo, se preenchido
export async function salvarCriterios(form: FormData) {
  const s = await exigirPerfil('coordenacao');
  const ciclo = await exigirCicloAtivo('/coordenacao/configuracao');
  await transacao(async (q) => {
    for (const c of await listarCriterios(ciclo.id)) {
      if (form.get(`remover_${c.id}`)) {
        await q('delete from criterio where id = $1', [c.id]);
      } else {
        await q('update criterio set nome = $1, peso = $2, fonte = $3, ordem = $4 where id = $5', [
          texto(form, `nome_${c.id}`), numero(form, `peso_${c.id}`),
          c.tipo === 'equipe' ? texto(form, `fonte_${c.id}`) : null, numero(form, `ordem_${c.id}`), c.id,
        ]);
      }
    }
    const tipo = texto(form, 'novo_tipo');
    if (texto(form, 'novo_nome')) {
      await q('insert into criterio (ciclo_id, tipo, nome, peso, fonte, ordem) values ($1, $2, $3, $4, $5, 99)', [
        ciclo.id, tipo, texto(form, 'novo_nome'), numero(form, 'novo_peso'),
        tipo === 'equipe' ? texto(form, 'novo_fonte') : null,
      ]);
    }
  });
  await auditar(s.id, 'critérios', `ciclo ${ciclo.id}`);
  redirect(comAviso('/coordenacao/configuracao', 'ok', 'Critérios salvos.'));
}

// Escala de conceitos (RN08)
export async function salvarEscala(form: FormData) {
  const s = await exigirPerfil('coordenacao');
  const ciclo = await exigirCicloAtivo('/coordenacao/configuracao');
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
  redirect(comAviso('/coordenacao/configuracao', 'ok', 'Escala salva.'));
}

// Novo ciclo: copia pesos, critérios e escala do ciclo ativo e passa a ser o ativo
export async function novoCiclo(form: FormData) {
  const s = await exigirPerfil('coordenacao');
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
          `insert into criterio (ciclo_id, tipo, nome, peso, fonte, ordem)
           select $1, tipo, nome, peso, fonte, ordem from criterio where ciclo_id = $2`,
          [c.id, anterior.id],
        );
        await q('insert into escala (ciclo_id, rotulo, valor) select $1, rotulo, valor from escala where ciclo_id = $2', [c.id, anterior.id]);
      }
      await q('update ciclo set ativo = (id = $1)', [c.id]);
    });
  } catch {
    redirect(comAviso('/coordenacao/configuracao', 'erro', 'Já existe um ciclo com esse semestre, modalidade e fase.'));
  }
  await auditar(s.id, 'novo ciclo', texto(form, 'semestre'));
  redirect(comAviso('/coordenacao/configuracao', 'ok', 'Novo ciclo criado e ativado.'));
}

export async function ativarCiclo(form: FormData) {
  const s = await exigirPerfil('coordenacao');
  await query('update ciclo set ativo = (id = $1)', [Number(form.get('id'))]);
  await auditar(s.id, 'ciclo ativado', String(form.get('id')));
  redirect(comAviso('/coordenacao/historico', 'ok', 'Ciclo ativado.'));
}

// RF06 / HU07: roda o motor de cálculo e grava os resultados com a memória de cálculo
export async function calcularNotas(form: FormData) {
  const s = await exigirPerfil('coordenacao');
  const ciclo = await buscarCiclo(Number(form.get('ciclo')));
  if (!ciclo) redirect('/coordenacao/resultados');

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
  redirect(comAviso(`/coordenacao/resultados?ciclo=${ciclo.id}`, 'ok', `Notas calculadas para ${resultados.length} estudante(s).`));
}

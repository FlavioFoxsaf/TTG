import ExcelJS from 'exceljs';
import { auditar, query } from '@/lib/db';
import { lerSessao } from '@/lib/auth';
import { NOME_PAPEL, type Papel } from '@/lib/calculo';
import {
  buscarCiclo, comAviso, comentariosDoCiclo, equipesVisiveis, listarResultados, nomeCiclo, relatorioAvaliacoes,
} from '@/lib/dados';

const duas = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

type Coluna = { header: string; key: string; width: number; numero?: boolean };

// Aba com cabeçalho destacado e fixo, filtro e números com 2 casas — pronta para ordenar e fazer gráficos
function aba(planilha: ExcelJS.Workbook, nome: string, colunas: Coluna[], linhas: Record<string, unknown>[]) {
  const ws = planilha.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = colunas.map(({ header, key, width }) => ({ header, key, width }));
  linhas.forEach((l) => ws.addRow(l));
  const cabecalho = ws.getRow(1);
  cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecalho.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A64' } };
  cabecalho.alignment = { vertical: 'middle', wrapText: true };
  cabecalho.height = 30;
  colunas.forEach((c, i) => {
    if (c.numero) ws.getColumn(i + 1).numFmt = '0.00';
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  return ws;
}

// RF10 / HU11: notas para o sistema acadêmico (o orientador de gestão lança nota a nota),
// com o detalhamento organizado em abas
export async function GET(req: Request) {
  const s = await lerSessao();
  if (!s || (s.perfil !== 'gestao' && s.perfil !== 'coordenacao')) return new Response('Acesso negado', { status: 403 });

  const ciclo = await buscarCiclo(Number(new URL(req.url).searchParams.get('ciclo')));
  if (!ciclo) return new Response('Ciclo não encontrado.', { status: 404 });

  // Só as equipes que o perfil pode ver (coordenação: todas; orientador de gestão: as suas)
  const equipes = await equipesVisiveis(s, ciclo.id);
  const visivel = new Set(equipes.map((e) => e.id));
  const resultados = (await listarResultados(ciclo.id)).filter((r) => visivel.has(r.equipe_id));
  if (!resultados.length) {
    // Volta para a tela com um aviso, em vez de abrir uma página só com texto
    const destino = comAviso(`/painel/resultados?ciclo=${ciclo.id}`, 'erro', 'Para exportar, clique antes em “Calcular notas” para gravar as notas do ciclo.');
    return Response.redirect(new URL(destino, req.url), 303);
  }

  const [avaliacoesTodas, orientadores, comentariosTodos] = await Promise.all([
    relatorioAvaliacoes(ciclo.id),
    query<{ id: number; nome: string }>(`select id, nome from usuario where perfil in ('gestao', 'execucao')`),
    comentariosDoCiclo(ciclo.id),
  ]);
  const avaliacoes = avaliacoesTodas.filter((a) => visivel.has(a.equipe_id));
  const comentarios = comentariosTodos.filter((c) => visivel.has(c.equipe_id));
  const nomeDe = (id: number | null) => orientadores.find((o) => o.id === id)?.nome ?? '';

  const planilha = new ExcelJS.Workbook();
  planilha.title = `Notas TTG — ${nomeCiclo(ciclo)}`;

  // 1. Uma linha por estudante, na ordem de lançamento
  aba(
    planilha,
    'Notas finais',
    [
      { header: 'Matrícula', key: 'matricula', width: 14 },
      { header: 'Estudante', key: 'estudante', width: 34 },
      { header: 'Equipe', key: 'equipe', width: 16 },
      { header: 'Nota final', key: 'nota_final', width: 12, numero: true },
    ],
    resultados.map((r) => ({ matricula: r.matricula, estudante: r.estudante, equipe: r.equipe, nota_final: duas(r.nota_final) })),
  );

  // 2. Resumo por equipe
  aba(
    planilha,
    'Por equipe',
    [
      { header: 'Equipe', key: 'equipe', width: 16 },
      { header: 'Cliente', key: 'cliente', width: 24 },
      { header: 'Orientador de gestão', key: 'gestao', width: 26 },
      { header: 'Orientador de execução', key: 'execucao', width: 26 },
      { header: 'Integrantes', key: 'n', width: 12 },
      { header: 'Nota da equipe', key: 'nota_equipe', width: 14, numero: true },
      { header: 'Média das notas finais', key: 'media', width: 16, numero: true },
      { header: 'Menor nota final', key: 'menor', width: 14, numero: true },
      { header: 'Maior nota final', key: 'maior', width: 14, numero: true },
    ],
    equipes
      .map((e) => {
        const r = resultados.filter((x) => x.equipe_id === e.id);
        if (!r.length) return null;
        const finais = r.map((x) => x.nota_final);
        return {
          equipe: e.nome,
          cliente: e.cliente ?? '',
          gestao: nomeDe(e.orient_gestao_id),
          execucao: nomeDe(e.orient_execucao_id),
          n: r.length,
          nota_equipe: duas(r[0].nota_equipe),
          media: duas(finais.reduce((a, b) => a + b, 0) / finais.length),
          menor: duas(Math.min(...finais)),
          maior: duas(Math.max(...finais)),
        };
      })
      .filter((x) => x !== null),
  );

  // 3. Detalhamento por estudante: as quatro fontes, conceito, CDI e nota final
  const fontes = resultados[0].memoria.fontes;
  aba(
    planilha,
    'Detalhamento',
    [
      { header: 'Equipe', key: 'equipe', width: 16 },
      { header: 'Matrícula', key: 'matricula', width: 14 },
      { header: 'Estudante', key: 'estudante', width: 32 },
      { header: 'Curso', key: 'curso', width: 28 },
      { header: 'Nota da equipe', key: 'nota_equipe', width: 14, numero: true },
      ...fontes.map((f, i) => ({ header: `${f.nome} (peso ${f.peso})`, key: `f${i}`, width: 20, numero: true })),
      { header: 'Conceito individual', key: 'conceito', width: 16, numero: true },
      { header: 'Maior conceito da equipe', key: 'maior', width: 16, numero: true },
      { header: 'CDI', key: 'cdi', width: 10, numero: true },
      { header: 'Nota final', key: 'nota_final', width: 12, numero: true },
    ],
    resultados.map((r) => ({
      equipe: r.equipe,
      matricula: r.matricula,
      estudante: r.estudante,
      curso: r.curso ?? '',
      nota_equipe: duas(r.nota_equipe),
      ...Object.fromEntries(r.memoria.fontes.map((f, i) => [`f${i}`, duas(f.valor)])),
      conceito: duas(r.conceito),
      maior: duas(r.memoria.maiorConceitoEquipe),
      cdi: duas(r.cdi),
      nota_final: duas(r.nota_final),
    })),
  );

  // 4. Componentes da nota de cada equipe (formato longo, bom para tabela dinâmica)
  const porEquipe = [...new Map(resultados.map((r) => [r.equipe_id, r])).values()];
  aba(
    planilha,
    'Componentes da equipe',
    [
      { header: 'Equipe', key: 'equipe', width: 16 },
      { header: 'Componente', key: 'componente', width: 40 },
      { header: 'Peso', key: 'peso', width: 10 },
      { header: 'Valor', key: 'valor', width: 10, numero: true },
    ],
    porEquipe.flatMap((r) =>
      r.memoria.componentesEquipe.map((c) => ({ equipe: r.equipe, componente: c.nome, peso: c.peso, valor: duas(c.valor) })),
    ),
  );

  // 5. Memória de cálculo em texto
  aba(
    planilha,
    'Memória de cálculo',
    [
      { header: 'Equipe', key: 'equipe', width: 16 },
      { header: 'Estudante', key: 'estudante', width: 32 },
      { header: 'Cálculo', key: 'formula', width: 80 },
    ],
    resultados.map((r) => ({ equipe: r.equipe, estudante: r.estudante, formula: r.memoria.formula })),
  );

  // 6. Avaliações brutas (origem de tudo)
  aba(
    planilha,
    'Avaliações (brutas)',
    [
      { header: 'Equipe', key: 'equipe', width: 16 },
      { header: 'Avaliador', key: 'avaliador', width: 28 },
      { header: 'Papel', key: 'papel', width: 30 },
      { header: 'Avaliado', key: 'avaliado', width: 28 },
      { header: 'Critério', key: 'criterio', width: 40 },
      { header: 'Valor', key: 'valor', width: 10, numero: true },
      { header: 'Atualizado em', key: 'atualizado_em', width: 18 },
    ],
    avaliacoes.map((a) => ({
      equipe: a.equipe,
      avaliador: a.avaliador,
      papel: NOME_PAPEL[a.papel as Papel] ?? a.papel,
      avaliado: a.avaliado ?? 'Equipe',
      criterio: a.criterio,
      valor: a.valor,
      atualizado_em: a.atualizado_em,
    })),
  );

  // 7. Comentários dos estudantes, sem autor (confidencial)
  aba(
    planilha,
    'Comentários',
    [
      { header: 'Equipe', key: 'equipe', width: 16 },
      { header: 'Seção', key: 'rotulo', width: 40 },
      { header: 'Comentário', key: 'texto', width: 100 },
    ],
    comentarios.map((c) => ({ equipe: c.equipe, rotulo: c.rotulo, texto: c.texto })),
  );

  await auditar(s.id, 'exportação', `ciclo ${ciclo.id}`);
  return new Response(await planilha.xlsx.writeBuffer(), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="notas-${ciclo.semestre}-fase${ciclo.fase}-${ciclo.modalidade}.xlsx"`,
    },
  });
}

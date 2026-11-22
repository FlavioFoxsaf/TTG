import ExcelJS from 'exceljs';
import { auditar } from '@/lib/db';
import { lerSessao } from '@/lib/auth';
import { buscarCiclo, listarResultados } from '@/lib/dados';

const duas = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

// RF10 / HU11: notas finais para o sistema acadêmico, uma linha por estudante, com memória de cálculo
export async function GET(req: Request) {
  const s = await lerSessao();
  if (s?.perfil !== 'coordenacao') return new Response('Acesso negado', { status: 403 });

  const ciclo = await buscarCiclo(Number(new URL(req.url).searchParams.get('ciclo')));
  const resultados = ciclo ? await listarResultados(ciclo.id) : [];
  if (!ciclo || !resultados.length) return new Response('Calcule as notas do ciclo antes de exportar.', { status: 400 });

  const planilha = new ExcelJS.Workbook();

  const notas = planilha.addWorksheet('Notas finais');
  notas.columns = [
    { header: 'Matrícula', key: 'matricula', width: 14 },
    { header: 'Estudante', key: 'estudante', width: 32 },
    { header: 'Nota final', key: 'nota_final', width: 12 },
  ];
  resultados.forEach((r) => notas.addRow({ matricula: r.matricula, estudante: r.estudante, nota_final: duas(r.nota_final) }));

  const memoria = planilha.addWorksheet('Memória de cálculo');
  memoria.columns = [
    { header: 'Equipe', key: 'equipe', width: 14 },
    { header: 'Estudante', key: 'estudante', width: 32 },
    { header: 'Nota da equipe', key: 'nota_equipe', width: 14 },
    ...resultados[0].memoria.fontes.map((f, i) => ({ header: `${f.nome} (peso ${f.peso})`, key: `f${i}`, width: 18 })),
    { header: 'Conceito individual', key: 'conceito', width: 18 },
    { header: 'CDI', key: 'cdi', width: 10 },
    { header: 'Nota final', key: 'nota_final', width: 12 },
    { header: 'Cálculo', key: 'formula', width: 60 },
  ];
  for (const r of resultados) {
    memoria.addRow({
      equipe: r.equipe,
      estudante: r.estudante,
      nota_equipe: duas(r.nota_equipe),
      ...Object.fromEntries(r.memoria.fontes.map((f, i) => [`f${i}`, duas(f.valor)])),
      conceito: duas(r.conceito),
      cdi: duas(r.cdi),
      nota_final: duas(r.nota_final),
      formula: r.memoria.formula,
    });
  }
  [notas, memoria].forEach((aba) => (aba.getRow(1).font = { bold: true }));

  await auditar(s.id, 'exportação', `ciclo ${ciclo.id}`);
  return new Response(await planilha.xlsx.writeBuffer(), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="notas-finais-${ciclo.semestre}-fase${ciclo.fase}.xlsx"`,
    },
  });
}

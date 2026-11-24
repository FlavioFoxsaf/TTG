import Papa from 'papaparse';
import { lerSessao } from '@/lib/auth';
import { equipesVisiveis, relatorioAvaliacoes } from '@/lib/dados';

// Report CSV: avaliações brutas do ciclo, entrada do motor de cálculo (RNF03)
export async function GET(req: Request) {
  const s = await lerSessao();
  if (!s || (s.perfil !== 'gestao' && s.perfil !== 'coordenacao')) return new Response('Acesso negado', { status: 403 });
  const ciclo = Number(new URL(req.url).searchParams.get('ciclo'));
  const visivel = new Set((await equipesVisiveis(s, ciclo)).map((e) => e.id));
  const linhas = (await relatorioAvaliacoes(ciclo)).filter((l) => visivel.has(l.equipe_id));
  const csv = Papa.unparse(linhas, { delimiter: ';' });
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="avaliacoes-ciclo-${ciclo}.csv"`,
    },
  });
}

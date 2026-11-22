import Papa from 'papaparse';
import { lerSessao } from '@/lib/auth';
import { relatorioAvaliacoes } from '@/lib/dados';

// Report CSV: avaliações brutas do ciclo, entrada do motor de cálculo (RNF03)
export async function GET(req: Request) {
  const perfil = (await lerSessao())?.perfil;
  if (perfil !== 'gestao' && perfil !== 'coordenacao') return new Response('Acesso negado', { status: 403 });
  const ciclo = Number(new URL(req.url).searchParams.get('ciclo'));
  const csv = Papa.unparse(await relatorioAvaliacoes(ciclo), { delimiter: ';' });
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="avaliacoes-ciclo-${ciclo}.csv"`,
    },
  });
}

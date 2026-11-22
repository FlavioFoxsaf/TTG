import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Acesso ao banco com SQL puro.
// Com DATABASE_URL (ex.: Supabase) usa o PostgreSQL remoto; sem ela, usa um
// PostgreSQL embutido (PGlite), sem precisar instalar nada.

// O banco local fica fora da pasta do projeto: OneDrive/Google Drive travam os
// arquivos durante a sincronização e o PGlite deixa de abrir.
const PASTA_LOCAL = process.env.PASTA_BANCO_LOCAL || join(homedir(), '.notattg-dados');

export type Consulta = <T = any>(sql: string, params?: unknown[]) => Promise<T[]>;

// numeric vem como number e date como texto 'AAAA-MM-DD'
const NUMERIC = 1700, DATE = 1082;

type Banco = {
  query: Consulta;
  transacao: <T>(fn: (q: Consulta) => Promise<T>) => Promise<T>;
  fechar: () => Promise<void>;
};

async function criarBanco(): Promise<Banco> {
  if (process.env.DATABASE_URL) {
    const { Pool, types } = await import('pg');
    types.setTypeParser(NUMERIC, parseFloat);
    types.setTypeParser(DATE, (v) => v);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return {
      query: async (sql, params) => (await pool.query(sql, params)).rows,
      transacao: async (fn) => {
        const cliente = await pool.connect();
        try {
          await cliente.query('begin');
          const r = await fn(async (sql, params) => (await cliente.query(sql, params)).rows);
          await cliente.query('commit');
          return r;
        } catch (e) {
          await cliente.query('rollback');
          throw e;
        } finally {
          cliente.release();
        }
      },
      fechar: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(PASTA_LOCAL, {
    parsers: { [NUMERIC]: parseFloat, [DATE]: (v: string) => v },
  });
  await pg.exec(readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf8'));
  return {
    query: async (sql, params) => (await pg.query<any>(sql, params)).rows,
    transacao: (fn) => pg.transaction((tx) => fn(async (sql, params) => (await tx.query<any>(sql, params)).rows)),
    fechar: () => pg.close(),
  };
}

// Uma única instância por processo (sobrevive ao recarregamento do Next em dev)
const g = globalThis as unknown as { banco?: Promise<Banco> };
const banco = () =>
  (g.banco ??= criarBanco().catch((e) => {
    g.banco = undefined; // não guarda a falha: tenta abrir de novo no próximo acesso
    throw new Error(
      `Não foi possível abrir o banco local (${PASTA_LOCAL}). Feche outros processos do sistema ` +
        `(npm run dev, npm start ou npm run seed) e inicie de novo. Detalhe: ${e.message}`,
    );
  }));

export const query: Consulta = async (sql, params) => (await banco()).query(sql, params);
export const transacao: Banco['transacao'] = async (fn) => (await banco()).transacao(fn);

export const fechar = async () => (await banco()).fechar();

export async function auditar(usuarioId: number | null, acao: string, detalhe = '') {
  await query('insert into auditoria (usuario_id, acao, detalhe) values ($1, $2, $3)', [usuarioId, acao, detalhe]);
}

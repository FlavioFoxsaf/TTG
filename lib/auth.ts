import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';

// Controle de acesso por perfil (RF03). A sessão é um token assinado em cookie httpOnly.

export type Perfil = 'coordenacao' | 'gestao' | 'execucao' | 'estudante';

export const NOME_PERFIL: Record<Perfil, string> = {
  coordenacao: 'Coordenação',
  gestao: 'Orientador de gestão de projetos',
  execucao: 'Orientador de execução técnica',
  estudante: 'Estudante',
};

// Área inicial de cada perfil
export const INICIO: Record<Perfil, string> = {
  coordenacao: '/painel/acompanhamento',
  gestao: '/painel/acompanhamento',
  execucao: '/painel/avaliar',
  estudante: '/estudante',
};
export type Sessao = { id: number; nome: string; perfil: Perfil };

const COOKIE = 'sessao';
const chave = new TextEncoder().encode(process.env.SESSION_SECRET ?? 'dev-notattg-troque-em-producao');

export async function criarSessao(s: Sessao) {
  const token = await new SignJWT(s).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('8h').sign(chave);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60,
  });
}

export async function encerrarSessao() {
  (await cookies()).delete(COOKIE);
}

export async function lerSessao(): Promise<Sessao | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chave);
    return { id: payload.id as number, nome: payload.nome as string, perfil: payload.perfil as Perfil };
  } catch {
    return null;
  }
}

// Usado no topo de cada página e ação: sem o perfil certo, volta para o login
export async function exigirPerfil(...perfis: Perfil[]): Promise<Sessao> {
  const s = await lerSessao();
  if (!s || !perfis.includes(s.perfil)) redirect('/login');
  return s;
}

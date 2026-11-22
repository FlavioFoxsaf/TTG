import { redirect } from 'next/navigation';
import { lerSessao } from '@/lib/auth';

// Cada perfil tem sua área inicial
const INICIO = { coordenacao: '/coordenacao/resultados', orientador: '/orientador', estudante: '/estudante' };

export default async function Inicio() {
  const s = await lerSessao();
  redirect(s ? INICIO[s.perfil] : '/login');
}

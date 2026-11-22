import { redirect } from 'next/navigation';
import { INICIO, lerSessao } from '@/lib/auth';

export default async function Inicio() {
  const s = await lerSessao();
  redirect(s ? INICIO[s.perfil] : '/login');
}

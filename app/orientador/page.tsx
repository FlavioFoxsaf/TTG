import { redirect } from 'next/navigation';

// A área do orientador de execução passou para o painel (avaliar + resultados das suas equipes)
export default function Orientador() {
  redirect('/painel/avaliar');
}

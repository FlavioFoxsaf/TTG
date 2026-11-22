import { exigirPerfil } from '@/lib/auth';
import { cicloAtivo } from '@/lib/dados';
import { Aviso } from '@/components/Aviso';
import { AreaOrientador } from '@/components/AreaOrientador';

type Busca = { equipe?: string; ok?: string; erro?: string };

// O orientador de gestão avalia suas equipes pelo olhar de gestão e lança a nota do cliente
export default async function Avaliar({ searchParams }: { searchParams: Promise<Busca> }) {
  const s = await exigirPerfil('gestao');
  const busca = await searchParams;
  const ciclo = await cicloAtivo();
  if (!ciclo) return <div className="cartao">Crie um ciclo avaliativo na aba Configuração.</div>;

  return (
    <>
      <Aviso busca={busca} />
      <AreaOrientador s={s} ciclo={ciclo} equipeId={Number(busca.equipe)} base="/painel/avaliar" />
    </>
  );
}

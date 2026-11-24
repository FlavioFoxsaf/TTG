import { exigirPerfil } from '@/lib/auth';
import { cicloAtivo } from '@/lib/dados';
import { Aviso } from '@/components/Aviso';
import { AreaOrientador } from '@/components/AreaOrientador';

type Busca = { equipe?: string; ok?: string; erro?: string };

// Os orientadores avaliam suas equipes (gestão também lança a nota do cliente)
export default async function Avaliar({ searchParams }: { searchParams: Promise<Busca> }) {
  const s = await exigirPerfil('gestao', 'execucao');
  const busca = await searchParams;
  const ciclo = await cicloAtivo();
  if (!ciclo) return <div className="cartao">Não há ciclo avaliativo ativo.</div>;

  return (
    <>
      <Aviso busca={busca} />
      <AreaOrientador s={s} ciclo={ciclo} equipeId={Number(busca.equipe)} base="/painel/avaliar" />
    </>
  );
}

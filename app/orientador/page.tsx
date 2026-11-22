import { exigirPerfil } from '@/lib/auth';
import { cicloAtivo, dataBR, nomeCiclo } from '@/lib/dados';
import { Aviso } from '@/components/Aviso';
import { AreaOrientador } from '@/components/AreaOrientador';
import { Cabecalho } from '@/components/Cabecalho';

type Busca = { equipe?: string; ok?: string; erro?: string };

// Área do orientador de execução técnica (o de gestão avalia em /painel/avaliar)
export default async function Orientador({ searchParams }: { searchParams: Promise<Busca> }) {
  const s = await exigirPerfil('execucao');
  const busca = await searchParams;
  const ciclo = await cicloAtivo();

  return (
    <>
      <Cabecalho
        subtitulo={
          ciclo
            ? `Orientador de execução técnica · ${nomeCiclo(ciclo)} · período de ${dataBR(ciclo.janela_inicio)} a ${dataBR(ciclo.janela_fim)}`
            : 'Orientador de execução técnica'
        }
        usuario={s.nome}
      />
      <main className="conteudo">
        <Aviso busca={busca} />
        {ciclo ? (
          <AreaOrientador s={s} ciclo={ciclo} equipeId={Number(busca.equipe)} base="/orientador" />
        ) : (
          <div className="cartao">Não há ciclo avaliativo ativo.</div>
        )}
      </main>
    </>
  );
}

import { sair } from '@/app/acoes';

export function Cabecalho({ subtitulo, usuario }: { subtitulo: string; usuario?: string }) {
  return (
    <header className="cabecalho">
      <div>
        <h1>NotaTTG</h1>
        <small>{subtitulo}</small>
      </div>
      {usuario && (
        <form action={sair}>
          <small>
            {usuario} · <button type="submit">Sair</button>
          </small>
        </form>
      )}
    </header>
  );
}

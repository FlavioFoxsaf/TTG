// Mostra a mensagem que as ações devolvem pela URL (?ok=... ou ?erro=...)
export function Aviso({ busca }: { busca: { ok?: string; erro?: string } }) {
  if (busca.erro) return <div className="aviso">{busca.erro}</div>;
  if (busca.ok) return <div className="aviso ok">{busca.ok}</div>;
  return null;
}

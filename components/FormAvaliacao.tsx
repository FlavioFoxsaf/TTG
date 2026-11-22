import { salvarAvaliacoes } from '@/app/acoes';
import { num, usaEscala, type Criterio } from '@/lib/dados';

type Props = {
  equipeId: number;
  volta: string; // página para onde voltar depois de salvar
  alvos: { id: number | null; nome: string }[]; // vazio = a própria equipe
  criterios: Criterio[];
  escala: { rotulo: string; valor: number }[];
  valores: Map<string, number>;
  bloqueado: boolean;
  mensagemBloqueio?: string;
  comentario?: { valor: string; rotulo: string }; // campo livre, como no formulário 360º
};

// Formulário único de avaliação (RF05).
// Componentes de equipe avaliados por orientadores/cliente recebem nota de 0 a 10;
// critérios individuais e perguntas do estudante sobre o projeto usam a escala de conceitos (1 a 5).
// Cada campo se chama "v|avaliado|criterio".
export function FormAvaliacao({ equipeId, volta, alvos, criterios, escala, valores, bloqueado, mensagemBloqueio, comentario }: Props) {
  const valor = (alvo: number | null, criterio: number) => valores.get(`${alvo ?? ''}|${criterio}`);

  const Escala = ({ alvo, c }: { alvo: number | null; c: Criterio }) => (
    <div className="opcoes">
      {escala.map((e, i) => (
        <label key={e.valor}>
          <input type="radio" name={`v|${alvo ?? ''}|${c.id}`} value={e.valor} defaultChecked={valor(alvo, c.id) === e.valor} />
          {i + 1} · {e.rotulo}
        </label>
      ))}
    </div>
  );

  return (
    <form action={salvarAvaliacoes}>
      <input type="hidden" name="equipe" value={equipeId} />
      <input type="hidden" name="volta" value={volta} />
      <fieldset disabled={bloqueado} style={{ border: 0, padding: 0, margin: 0 }}>
        {criterios.map((c, n) =>
          c.tipo === 'equipe' && !usaEscala(c) ? (
            <div key={c.id} className="linha" style={{ padding: '6px 0', borderBottom: '1px solid var(--borda)' }}>
              <span>
                {c.nome} <span className="suave">(peso {num(c.peso, 0)})</span>
              </span>
              <input
                type="number" name={`v||${c.id}`} min={0} max={10} step={0.1}
                defaultValue={valor(null, c.id)} style={{ width: 90 }} aria-label={c.nome}
              />
            </div>
          ) : c.tipo === 'equipe' ? (
            <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--borda)' }}>
              <p style={{ margin: '0 0 6px' }}>{n + 1}) {c.nome}</p>
              <Escala alvo={null} c={c} />
            </div>
          ) : (
            <div key={c.id}>
              <h3>Critério: {c.nome}</h3>
              <table>
                <tbody>
                  {alvos.map((a) => (
                    <tr key={a.id}>
                      <td style={{ width: '30%' }}>{a.nome}</td>
                      <td><Escala alvo={a.id} c={c} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        )}
        {comentario && (
          <div style={{ marginTop: 14 }}>
            <label htmlFor="comentario">{comentario.rotulo}</label>
            <textarea id="comentario" name="comentario" defaultValue={comentario.valor} />
          </div>
        )}
        <p className="suave">
          {bloqueado
            ? (mensagemBloqueio ?? 'Esta avaliação não está liberada no momento.')
            : 'Suas respostas são confidenciais e podem ser editadas até o fim do período.'}
        </p>
        <div style={{ textAlign: 'right' }}>
          <button className="botao" type="submit">Salvar</button>
        </div>
      </fieldset>
    </form>
  );
}

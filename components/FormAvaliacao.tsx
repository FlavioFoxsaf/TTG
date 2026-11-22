import { salvarAvaliacoes } from '@/app/acoes';
import { num, type Criterio } from '@/lib/dados';

type Props = {
  equipeId: number;
  volta: string; // página para onde voltar depois de salvar
  alvos: { id: number | null; nome: string }[]; // id nulo = a própria equipe
  criterios: Criterio[];
  escala: { rotulo: string; valor: number }[];
  valores: Map<string, number>;
  bloqueado: boolean;
};

// Formulário único de avaliação (RF05).
// Componentes de equipe recebem nota de 0 a 10; critérios individuais usam a escala de conceitos.
// Cada campo se chama "v|avaliado|criterio".
export function FormAvaliacao({ equipeId, volta, alvos, criterios, escala, valores, bloqueado }: Props) {
  const valor = (alvo: number | null, criterio: number) => valores.get(`${alvo ?? ''}|${criterio}`);

  return (
    <form action={salvarAvaliacoes}>
      <input type="hidden" name="equipe" value={equipeId} />
      <input type="hidden" name="volta" value={volta} />
      <fieldset disabled={bloqueado} style={{ border: 0, padding: 0, margin: 0 }}>
        {criterios.map((c) =>
          c.tipo === 'equipe' ? (
            <div key={c.id} className="linha" style={{ padding: '6px 0', borderBottom: '1px solid var(--borda)' }}>
              <span>
                {c.nome} <span className="suave">(peso {num(c.peso, 0)})</span>
              </span>
              <input
                type="number" name={`v||${c.id}`} min={0} max={10} step={0.1}
                defaultValue={valor(null, c.id)} style={{ width: 90 }} aria-label={c.nome}
              />
            </div>
          ) : (
            <div key={c.id}>
              <h3>Critério: {c.nome}</h3>
              <table>
                <tbody>
                  {alvos.map((a) => (
                    <tr key={a.id}>
                      <td style={{ width: '30%' }}>{a.nome}</td>
                      <td>
                        <div className="opcoes">
                          {escala.map((e) => (
                            <label key={e.valor}>
                              <input
                                type="radio" name={`v|${a.id}|${c.id}`} value={e.valor}
                                defaultChecked={valor(a.id, c.id) === e.valor}
                              />
                              {e.rotulo}
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        )}
        <p className="suave">
          {bloqueado
            ? 'A janela de avaliação está fechada.'
            : 'Suas respostas são confidenciais e podem ser editadas até o fim da janela.'}
        </p>
        <div style={{ textAlign: 'right' }}>
          <button className="botao" type="submit">Salvar</button>
        </div>
      </fieldset>
    </form>
  );
}

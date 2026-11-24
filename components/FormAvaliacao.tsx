import { salvarAvaliacoes } from '@/app/acoes';
import { num, usaEscala, type Criterio } from '@/lib/dados';

export type CampoComentario = { tipo: string; rotulo: string; valor: string };

type Props = {
  equipeId: number;
  volta: string; // página para onde voltar depois de salvar
  alvos: { id: number | null; nome: string }[]; // vazio = a própria equipe
  criterios: Criterio[];
  escala: { rotulo: string; valor: number }[];
  valores: Map<string, number>;
  bloqueado: boolean;
  mensagemBloqueio?: string;
  primeiraPessoa?: boolean; // autoavaliação: usa o texto da pergunta em primeira pessoa
  comentarioPorCriterio?: (c: Criterio) => CampoComentario; // campo logo abaixo de cada questão
  comentarios?: CampoComentario[]; // campos no fim do formulário
};

// Formulário único de avaliação (RF05), no formato do formulário "Avaliação 360º" do professor.
// Componentes de equipe avaliados por orientadores/cliente recebem nota de 0 a 10;
// critérios individuais e perguntas do estudante sobre o projeto usam a escala de conceitos (1 a 5).
// Campos: "v|avaliado|criterio" para notas e "c|tipo" para comentários.
export function FormAvaliacao(p: Props) {
  const { equipeId, volta, alvos, criterios, escala, valores, bloqueado } = p;
  const valor = (alvo: number | null, criterio: number) => valores.get(`${alvo ?? ''}|${criterio}`);
  const texto = (c: Criterio) => (p.primeiraPessoa ? c.descricao_auto || c.descricao : c.descricao);

  // As frases das pontas valem para a avaliação do projeto e para a autoavaliação (texto em primeira pessoa)
  const ancoras = (c: Criterio) => (c.tipo === 'equipe' || p.primeiraPessoa) && (c.ancora_min || c.ancora_max);

  const Escala = ({ alvo, c }: { alvo: number | null; c: Criterio }) => (
    <>
      <div className="opcoes">
        {escala.map((e, i) => (
          <label key={e.valor}>
            <input type="radio" name={`v|${alvo ?? ''}|${c.id}`} value={e.valor} defaultChecked={valor(alvo, c.id) === e.valor} />
            {i + 1} · {e.rotulo}
          </label>
        ))}
      </div>
      {ancoras(c) && (
        <div className="linha suave" style={{ alignItems: 'flex-start', marginTop: 6, fontSize: 12 }}>
          <span style={{ flex: 1 }}>{c.ancora_min && <>1 = {c.ancora_min}</>}</span>
          <span style={{ flex: 1, textAlign: 'right' }}>{c.ancora_max && <>{escala.length} = {c.ancora_max}</>}</span>
        </div>
      )}
    </>
  );

  const Pergunta = ({ c, n }: { c: Criterio; n: number }) => (
    <>
      <p style={{ margin: '0 0 4px' }}><strong>{n}) {c.nome}</strong></p>
      {texto(c) && <p className="suave" style={{ margin: '0 0 8px', fontSize: 13 }}>{texto(c)}</p>}
    </>
  );

  const Comentario = ({ campo }: { campo: CampoComentario }) => (
    <div style={{ marginTop: 10 }}>
      <label htmlFor={`c-${campo.tipo}`}>{campo.rotulo}</label>
      <textarea id={`c-${campo.tipo}`} name={`c|${campo.tipo}`} defaultValue={campo.valor} />
    </div>
  );

  return (
    <form action={salvarAvaliacoes}>
      <input type="hidden" name="equipe" value={equipeId} />
      <input type="hidden" name="volta" value={volta} />
      <fieldset disabled={bloqueado} style={{ border: 0, padding: 0, margin: 0 }}>
        {criterios.map((c, i) =>
          c.tipo === 'equipe' && !usaEscala(c) ? (
            <div key={c.id} className="linha" style={{ padding: '6px 0', borderBottom: '1px solid var(--borda)' }}>
              <span>
                {c.nome} <span className="suave">(peso {num(c.peso, 0)})</span>
                {c.descricao && <><br /><small className="suave">{c.descricao}</small></>}
              </span>
              <input
                type="number" name={`v||${c.id}`} min={0} max={10} step={0.1}
                defaultValue={valor(null, c.id)} style={{ width: 90 }} aria-label={c.nome}
              />
            </div>
          ) : c.tipo === 'equipe' ? (
            <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--borda)' }}>
              <Pergunta c={c} n={i + 1} />
              <Escala alvo={null} c={c} />
            </div>
          ) : (
            <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--borda)' }}>
              <Pergunta c={c} n={i + 1} />
              <table>
                <tbody>
                  {alvos.map((a) => (
                    <tr key={a.id}>
                      {!p.primeiraPessoa && <td style={{ width: '30%' }}>{a.nome}</td>}
                      <td><Escala alvo={a.id} c={c} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {p.comentarioPorCriterio && <Comentario campo={p.comentarioPorCriterio(c)} />}
            </div>
          ),
        )}
        {p.comentarios?.map((campo) => <Comentario key={campo.tipo} campo={campo} />)}
        <p className="suave">
          {bloqueado
            ? (p.mensagemBloqueio ?? 'Esta avaliação não está liberada no momento.')
            : 'Suas respostas são confidenciais e podem ser editadas até o fim do período.'}
        </p>
        <div style={{ textAlign: 'right' }}>
          <button className="botao" type="submit">Salvar</button>
        </div>
      </fieldset>
    </form>
  );
}

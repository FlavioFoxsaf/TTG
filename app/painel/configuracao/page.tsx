import { exigirPerfil } from '@/lib/auth';
import { NOME_FONTE_CRITERIO, somasDePeso, type FonteCriterio } from '@/lib/calculo';
import { cicloAtivo, listarCriterios, listarEscala, num, type Criterio } from '@/lib/dados';
import { Aviso } from '@/components/Aviso';
import { novoCiclo, salvarCiclo, salvarCriterios, salvarEscala } from '../acoes';

// RF04 / HU04: critérios, pesos, escala e janelas por semestre, modalidade e fase (RN08)
export default async function Configuracao({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await exigirPerfil('gestao');
  const busca = await searchParams;
  const ciclo = await cicloAtivo();
  const [criterios, escala] = ciclo ? await Promise.all([listarCriterios(ciclo.id), listarEscala(ciclo.id)]) : [[], []];
  const somas = ciclo
    ? somasDePeso(criterios, {
        orient_gestao: ciclo.peso_orient_gestao,
        orient_execucao: ciclo.peso_orient_execucao,
        auto: ciclo.peso_auto,
        colega: ciclo.peso_colegas,
      })
    : null;

  return (
    <>
      <Aviso busca={busca} />
      {ciclo && somas && (
        <>
          <form action={salvarCiclo} className="cartao">
            <h2>Processo avaliativo ativo</h2>
            <div className="campos">
              <div><label>Semestre</label><input name="semestre" defaultValue={ciclo.semestre} required /></div>
              <div><label>Modalidade</label><input name="modalidade" defaultValue={ciclo.modalidade} required /></div>
              <div><label>Fase</label><input name="fase" type="number" min={1} defaultValue={ciclo.fase} required /></div>
            </div>

            <h3>Períodos de avaliação</h3>
            <p className="suave">
              O estudante só avalia e só vê a nota quando o período estiver liberado. Datas vazias = fechado.
            </p>
            <table>
              <thead><tr><th>Etapa</th><th>Início</th><th>Fim</th><th>Hoje</th></tr></thead>
              <tbody>
                <tr>
                  <td>Orientadores (gestão, execução e nota do cliente)</td>
                  <td><input name="janela_inicio" type="date" defaultValue={ciclo.janela_inicio} required /></td>
                  <td><input name="janela_fim" type="date" defaultValue={ciclo.janela_fim} required /></td>
                  <td><Situacao aberta={ciclo.janela_aberta} /></td>
                </tr>
                <tr>
                  <td>Estudante: projeto e autoavaliação</td>
                  <td><input name="auto_inicio" type="date" defaultValue={ciclo.auto_inicio ?? ''} /></td>
                  <td><input name="auto_fim" type="date" defaultValue={ciclo.auto_fim ?? ''} /></td>
                  <td><Situacao aberta={ciclo.auto_aberta} /></td>
                </tr>
                <tr>
                  <td>Estudante: avaliação dos colegas</td>
                  <td><input name="colegas_inicio" type="date" defaultValue={ciclo.colegas_inicio ?? ''} /></td>
                  <td><input name="colegas_fim" type="date" defaultValue={ciclo.colegas_fim ?? ''} /></td>
                  <td><Situacao aberta={ciclo.colegas_aberta} /></td>
                </tr>
                <tr>
                  <td>Estudante: ver "Minha nota" a partir de</td>
                  <td><input name="nota_liberada_em" type="date" defaultValue={ciclo.nota_liberada_em ?? ''} /></td>
                  <td></td>
                  <td><Situacao aberta={ciclo.nota_liberada} rotulos={['liberada', 'bloqueada']} /></td>
                </tr>
              </tbody>
            </table>

            <h3>Pesos das fontes do conceito individual (RN02) <Soma valor={somas.fontes} /></h3>
            <div className="campos">
              <div><label>Orient. gestão de projetos</label><input name="peso_orient_gestao" defaultValue={ciclo.peso_orient_gestao} /></div>
              <div><label>Orient. execução técnica</label><input name="peso_orient_execucao" defaultValue={ciclo.peso_orient_execucao} /></div>
              <div><label>Autoavaliação</label><input name="peso_auto" defaultValue={ciclo.peso_auto} /></div>
              <div><label>Colegas</label><input name="peso_colegas" defaultValue={ciclo.peso_colegas} /></div>
            </div>
            <p className="suave">A configuração só é salva se os quatro pesos somarem 100%.</p>
            <button className="botao">Salvar</button>
          </form>

          <form action={salvarCriterios} className="cartao">
            <h2>Critérios</h2>
            <p className="suave">
              Componentes da equipe <Soma valor={somas.equipe} />: nota de 0 a 10 dada pelos orientadores ou pelo cliente;
              as perguntas respondidas pelos estudantes usam a escala de conceitos.
              <br />
              Critérios individuais (escala de conceitos), por avaliador:{' '}
              {somas.individual.map((g) => (
                <span key={g.grupo} style={{ marginRight: 12 }}>{g.grupo} <Soma valor={g.soma} /></span>
              ))}
              <br />
              Os critérios só são salvos se cada grupo somar 100%. Remover um critério apaga as avaliações já feitas nele.
            </p>
            <table>
              <thead>
                <tr><th>Tipo</th><th>Nome</th><th>Peso</th><th>Avaliado por</th><th>Ordem</th><th>Remover</th></tr>
              </thead>
              <tbody>
                {criterios.map((c) => <LinhaCriterio key={c.id} c={c} />)}
                <tr>
                  <td>
                    <select name="novo_tipo"><option value="equipe">equipe</option><option value="individual">individual</option></select>
                  </td>
                  <td>
                    <input name="novo_nome" placeholder="Novo critério (título curto)" style={{ width: '100%' }} />
                    <textarea name="novo_descricao" placeholder="Texto completo da pergunta (opcional)" style={{ minHeight: 50 }} />
                  </td>
                  <td><input name="novo_peso" defaultValue={0} style={{ width: 70 }} /></td>
                  <td><SelectFonte nome="novo_fonte" tipo="equipe" /></td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
            <p><button className="botao">Salvar critérios</button></p>
          </form>

          <form action={salvarEscala} className="cartao">
            <h2>Escala de conceitos</h2>
            <p className="suave">
              Usada nas avaliações individuais e nas perguntas do estudante sobre o projeto. O valor (0 a 10) é o que entra
              no cálculo.
            </p>
            <table>
              <thead><tr><th>Nível</th><th>Conceito</th><th>Valor</th><th>Remover</th></tr></thead>
              <tbody>
                {escala.map((e, i) => (
                  <tr key={e.id}>
                    <td>{i + 1}</td>
                    <td><input name={`rotulo_${e.id}`} defaultValue={e.rotulo} /></td>
                    <td><input name={`valor_${e.id}`} defaultValue={e.valor} style={{ width: 70 }} /></td>
                    <td><input type="checkbox" name={`remover_${e.id}`} /></td>
                  </tr>
                ))}
                <tr>
                  <td></td>
                  <td><input name="novo_rotulo" placeholder="Novo conceito" /></td>
                  <td><input name="novo_valor" style={{ width: 70 }} /></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            <p><button className="botao">Salvar escala</button></p>
          </form>
        </>
      )}

      <form action={novoCiclo} className="cartao">
        <h2>Novo ciclo avaliativo</h2>
        <p className="suave">
          O novo ciclo copia pesos, critérios e escala do ciclo ativo e passa a ser o ativo. O ciclo atual fica no Histórico.
          Os períodos do estudante começam fechados.
        </p>
        <div className="campos">
          <div><label>Semestre</label><input name="semestre" placeholder="2027.1" required /></div>
          <div><label>Modalidade</label><input name="modalidade" placeholder="presencial" required /></div>
          <div><label>Fase</label><input name="fase" type="number" min={1} defaultValue={1} required /></div>
          <div><label>Orientadores: início</label><input name="janela_inicio" type="date" required /></div>
          <div><label>Orientadores: fim</label><input name="janela_fim" type="date" required /></div>
        </div>
        <button className="botao">Criar ciclo</button>
      </form>
    </>
  );
}

function Situacao({ aberta, rotulos = ['aberto', 'fechado'] }: { aberta: boolean; rotulos?: [string, string] }) {
  return <strong style={{ color: aberta ? 'var(--ok, #1a7f37)' : 'var(--erro, #b42318)' }}>{aberta ? rotulos[0] : rotulos[1]}</strong>;
}

// Soma dos pesos: verde quando fecha 100%, vermelho quando não
function Soma({ valor }: { valor: number }) {
  const ok = Math.abs(valor - 100) < 1e-6;
  return (
    <span style={{ color: ok ? 'var(--ok, #1a7f37)' : 'var(--erro, #b42318)', fontWeight: 600 }}>
      ({num(valor, valor % 1 ? 2 : 0)}%{ok ? '' : ' — precisa somar 100%'})
    </span>
  );
}

function SelectFonte({ nome, tipo, valor }: { nome: string; tipo: 'equipe' | 'individual'; valor?: string | null }) {
  const opcoes = (Object.keys(NOME_FONTE_CRITERIO) as FonteCriterio[]).filter((f) => tipo === 'equipe' || f !== 'cliente');
  return (
    <select name={nome} defaultValue={valor ?? (tipo === 'equipe' ? 'orientador' : '')}>
      {tipo === 'individual' && <option value="">todos (orientadores e estudantes)</option>}
      {opcoes.map((f) => (
        <option key={f} value={f}>{NOME_FONTE_CRITERIO[f]}</option>
      ))}
    </select>
  );
}

function LinhaCriterio({ c }: { c: Criterio }) {
  return (
    <tr>
      <td>{c.tipo}</td>
      <td>
        <input name={`nome_${c.id}`} defaultValue={c.nome} style={{ width: '100%' }} />
        <details>
          <summary className="suave">texto completo da pergunta{c.descricao ? '' : ' (vazio)'}</summary>
          <textarea name={`descricao_${c.id}`} defaultValue={c.descricao ?? ''} placeholder="Como a pergunta aparece no formulário" />
          {c.tipo === 'individual' && (
            <textarea
              name={`descricao_auto_${c.id}`} defaultValue={c.descricao_auto ?? ''}
              placeholder="Versão em primeira pessoa para a autoavaliação (vazio = usa o texto acima)"
            />
          )}
          <input name={`ancora_min_${c.id}`} defaultValue={c.ancora_min ?? ''} placeholder="Frase da nota mais baixa (opcional)" style={{ width: '100%', marginTop: 4 }} />
          <input name={`ancora_max_${c.id}`} defaultValue={c.ancora_max ?? ''} placeholder="Frase da nota mais alta (opcional)" style={{ width: '100%', marginTop: 4 }} />
        </details>
      </td>
      <td><input name={`peso_${c.id}`} defaultValue={c.peso} style={{ width: 70 }} /></td>
      <td><SelectFonte nome={`fonte_${c.id}`} tipo={c.tipo} valor={c.fonte} /></td>
      <td><input name={`ordem_${c.id}`} defaultValue={c.ordem} style={{ width: 55 }} /></td>
      <td><input type="checkbox" name={`remover_${c.id}`} /></td>
    </tr>
  );
}

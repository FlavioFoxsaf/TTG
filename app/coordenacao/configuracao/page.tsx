import { exigirPerfil } from '@/lib/auth';
import { cicloAtivo, listarCriterios, listarEscala, num, type Criterio } from '@/lib/dados';
import { Aviso } from '@/components/Aviso';
import { novoCiclo, salvarCiclo, salvarCriterios, salvarEscala } from '../acoes';

// RF04 / HU04: critérios, pesos, escala e janela por semestre, modalidade e fase (RN08)
export default async function Configuracao({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await exigirPerfil('coordenacao');
  const busca = await searchParams;
  const ciclo = await cicloAtivo();
  const [criterios, escala] = ciclo ? await Promise.all([listarCriterios(ciclo.id), listarEscala(ciclo.id)]) : [[], []];
  const soma = (tipo: string) => criterios.filter((c) => c.tipo === tipo).reduce((s, c) => s + c.peso, 0);

  return (
    <>
      <Aviso busca={busca} />
      {ciclo && (
        <>
          <form action={salvarCiclo} className="cartao">
            <h2>Processo avaliativo ativo</h2>
            <div className="campos">
              <div><label>Semestre</label><input name="semestre" defaultValue={ciclo.semestre} required /></div>
              <div><label>Modalidade</label><input name="modalidade" defaultValue={ciclo.modalidade} required /></div>
              <div><label>Fase</label><input name="fase" type="number" min={1} defaultValue={ciclo.fase} required /></div>
              <div><label>Janela: início</label><input name="janela_inicio" type="date" defaultValue={ciclo.janela_inicio} required /></div>
              <div><label>Janela: fim</label><input name="janela_fim" type="date" defaultValue={ciclo.janela_fim} required /></div>
            </div>
            <h3>Pesos das fontes do conceito individual (RN02)</h3>
            <div className="campos">
              <div><label>Orient. gestão</label><input name="peso_orient_gestao" defaultValue={ciclo.peso_orient_gestao} /></div>
              <div><label>Orient. execução</label><input name="peso_orient_execucao" defaultValue={ciclo.peso_orient_execucao} /></div>
              <div><label>Autoavaliação</label><input name="peso_auto" defaultValue={ciclo.peso_auto} /></div>
              <div><label>Colegas</label><input name="peso_colegas" defaultValue={ciclo.peso_colegas} /></div>
            </div>
            <p className="suave">
              Janela {ciclo.janela_aberta ? 'aberta' : 'fechada'} hoje. Fora dela, o registro de avaliações fica bloqueado (RN07).
            </p>
            <button className="botao">Salvar</button>
          </form>

          <form action={salvarCriterios} className="cartao">
            <h2>Critérios</h2>
            <p className="suave">
              Componentes da equipe: nota de 0 a 10 dada pela fonte indicada (soma dos pesos: {num(soma('equipe'), 0)}).
              Critérios individuais: avaliados na escala de conceitos (soma dos pesos: {num(soma('individual'), 0)}).
              Remover um critério apaga as avaliações já feitas nele.
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
                  <td><input name="novo_nome" placeholder="Novo critério" /></td>
                  <td><input name="novo_peso" defaultValue={0} style={{ width: 70 }} /></td>
                  <td><SelectFonte nome="novo_fonte" /></td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
            <p><button className="botao">Salvar critérios</button></p>
          </form>

          <form action={salvarEscala} className="cartao">
            <h2>Escala de conceitos</h2>
            <table>
              <thead><tr><th>Conceito</th><th>Valor</th><th>Remover</th></tr></thead>
              <tbody>
                {escala.map((e) => (
                  <tr key={e.id}>
                    <td><input name={`rotulo_${e.id}`} defaultValue={e.rotulo} /></td>
                    <td><input name={`valor_${e.id}`} defaultValue={e.valor} style={{ width: 70 }} /></td>
                    <td><input type="checkbox" name={`remover_${e.id}`} /></td>
                  </tr>
                ))}
                <tr>
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
        </p>
        <div className="campos">
          <div><label>Semestre</label><input name="semestre" placeholder="2027.1" required /></div>
          <div><label>Modalidade</label><input name="modalidade" placeholder="presencial" required /></div>
          <div><label>Fase</label><input name="fase" type="number" min={1} defaultValue={1} required /></div>
          <div><label>Janela: início</label><input name="janela_inicio" type="date" required /></div>
          <div><label>Janela: fim</label><input name="janela_fim" type="date" required /></div>
        </div>
        <button className="botao">Criar ciclo</button>
      </form>
    </>
  );
}

function SelectFonte({ nome, valor }: { nome: string; valor?: string | null }) {
  return (
    <select name={nome} defaultValue={valor ?? 'orientador'}>
      <option value="orientador">orientadores</option>
      <option value="estudante">estudantes</option>
    </select>
  );
}

function LinhaCriterio({ c }: { c: Criterio }) {
  return (
    <tr>
      <td>{c.tipo}</td>
      <td><input name={`nome_${c.id}`} defaultValue={c.nome} style={{ width: '100%' }} /></td>
      <td><input name={`peso_${c.id}`} defaultValue={c.peso} style={{ width: 70 }} /></td>
      <td>{c.tipo === 'equipe' ? <SelectFonte nome={`fonte_${c.id}`} valor={c.fonte} /> : 'orientadores, própria pessoa e colegas'}</td>
      <td><input name={`ordem_${c.id}`} defaultValue={c.ordem} style={{ width: 55 }} /></td>
      <td><input type="checkbox" name={`remover_${c.id}`} /></td>
    </tr>
  );
}

// Motor de cálculo (RN01 a RN04). Função pura: não acessa banco nem tela.
// Entrada: as linhas do report CSV de avaliações + a configuração do ciclo.

export const FONTES = ['orient_gestao', 'orient_execucao', 'auto', 'colega'] as const;
export type Fonte = (typeof FONTES)[number];
export type Papel = Fonte | 'projeto';

export const NOME_FONTE: Record<Fonte, string> = {
  orient_gestao: 'Orientador de gestão',
  orient_execucao: 'Orientador de execução técnica',
  auto: 'Autoavaliação',
  colega: 'Avaliação dos colegas',
};

// Uma linha do report CSV
export type LinhaAvaliacao = {
  equipe_id: number;
  avaliador_id: number;
  papel: Papel;
  avaliado_id: number | null; // nulo = avaliação da equipe
  criterio_id: number;
  valor: number;
};

export type ConfigCalculo = {
  criterios: { id: number; tipo: 'equipe' | 'individual'; nome: string; peso: number }[];
  pesosFontes: Record<Fonte, number>;
  equipes: { id: number; membros: number[] }[];
};

export type Item = { nome: string; peso: number; valor: number | null };

export type Memoria = {
  componentesEquipe: Item[];
  fontes: Item[];
  maiorConceitoEquipe: number;
  formula: string;
};

export type ResultadoEstudante = {
  estudante_id: number;
  equipe_id: number;
  nota_equipe: number;
  conceito: number;
  cdi: number;
  nota_final: number;
  memoria: Memoria;
};

const media = (valores: number[]) =>
  valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;

// Média ponderada que ignora itens sem valor (os pesos restantes são renormalizados)
export function mediaPonderada(itens: Item[]): number | null {
  const validos = itens.filter((i) => i.valor !== null && i.peso > 0);
  const somaPesos = validos.reduce((s, i) => s + i.peso, 0);
  if (!somaPesos) return null;
  return validos.reduce((s, i) => s + i.valor! * i.peso, 0) / somaPesos;
}

const fmt = (n: number, casas = 2) => n.toFixed(casas).replace('.', ',');

export function calcular(linhas: LinhaAvaliacao[], config: ConfigCalculo): ResultadoEstudante[] {
  const criteriosEquipe = config.criterios.filter((c) => c.tipo === 'equipe');
  const criteriosIndividuais = config.criterios.filter((c) => c.tipo === 'individual');

  // Para cada critério, a média dos valores das linhas selecionadas
  const itensPorCriterio = (criterios: ConfigCalculo['criterios'], selecao: LinhaAvaliacao[]): Item[] =>
    criterios.map((c) => ({
      nome: c.nome,
      peso: c.peso,
      valor: media(selecao.filter((l) => l.criterio_id === c.id).map((l) => l.valor)),
    }));

  const resultados: ResultadoEstudante[] = [];

  for (const equipe of config.equipes) {
    const daEquipe = linhas.filter((l) => l.equipe_id === equipe.id);

    // RN01: nota da equipe = média ponderada dos componentes
    const componentesEquipe = itensPorCriterio(criteriosEquipe, daEquipe.filter((l) => l.avaliado_id === null));
    const notaEquipe = mediaPonderada(componentesEquipe) ?? 0;

    // RN02: conceito individual = média ponderada das quatro fontes
    const individuais = equipe.membros.map((estudanteId) => {
      const fontes: Item[] = FONTES.map((fonte) => ({
        nome: NOME_FONTE[fonte],
        peso: config.pesosFontes[fonte],
        valor: mediaPonderada(
          itensPorCriterio(
            criteriosIndividuais,
            daEquipe.filter((l) => l.avaliado_id === estudanteId && l.papel === fonte),
          ),
        ),
      }));
      return { estudanteId, fontes, conceito: mediaPonderada(fontes) ?? 0 };
    });

    // RN03: CDI = conceito / maior conceito da equipe;  RN04: nota final = nota da equipe x CDI
    const maior = Math.max(0, ...individuais.map((i) => i.conceito));
    for (const { estudanteId, fontes, conceito } of individuais) {
      const cdi = maior > 0 ? conceito / maior : 0;
      const notaFinal = notaEquipe * cdi;
      resultados.push({
        estudante_id: estudanteId,
        equipe_id: equipe.id,
        nota_equipe: notaEquipe,
        conceito,
        cdi,
        nota_final: notaFinal,
        memoria: {
          componentesEquipe,
          fontes,
          maiorConceitoEquipe: maior,
          formula:
            `CDI = ${fmt(conceito)} ÷ ${fmt(maior)} = ${fmt(cdi)}; ` +
            `nota final = ${fmt(notaEquipe)} × ${fmt(cdi)} = ${fmt(notaFinal)}`,
        },
      });
    }
  }
  return resultados;
}

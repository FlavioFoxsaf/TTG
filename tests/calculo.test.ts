import { describe, expect, it } from 'vitest';
import { calcular, mediaPonderada, type ConfigCalculo, type LinhaAvaliacao } from '../lib/calculo';

// Critério 1: componente de equipe; critério 2: critério individual
const config: ConfigCalculo = {
  criterios: [
    { id: 1, tipo: 'equipe', nome: 'Entrega', peso: 100 },
    { id: 2, tipo: 'individual', nome: 'Contribuição', peso: 100 },
  ],
  pesosFontes: { orient_gestao: 25, orient_execucao: 25, auto: 25, colega: 25 },
  equipes: [{ id: 3, membros: [10, 11] }],
};

const linha = (p: Partial<LinhaAvaliacao>): LinhaAvaliacao => ({
  equipe_id: 3, avaliador_id: 99, papel: 'orient_gestao', avaliado_id: null, criterio_id: 2, valor: 0, ...p,
});

// Todas as fontes dão o mesmo conceito para facilitar a conferência
const conceitoDe = (estudante: number, valor: number) =>
  (['orient_gestao', 'orient_execucao', 'auto', 'colega'] as const).map((papel) =>
    linha({ papel, avaliado_id: estudante, valor }),
  );

describe('motor de cálculo', () => {
  it('reproduz o exemplo do protótipo (8,40 × 0,90 = 7,56)', () => {
    const linhas = [linha({ criterio_id: 1, valor: 8.4 }), ...conceitoDe(10, 9), ...conceitoDe(11, 8.1)];
    const [k, l] = calcular(linhas, config);

    expect(k.nota_equipe).toBeCloseTo(8.4);
    expect(k.cdi).toBeCloseTo(1);
    expect(k.nota_final).toBeCloseTo(8.4);
    expect(l.conceito).toBeCloseTo(8.1);
    expect(l.cdi).toBeCloseTo(0.9);
    expect(l.nota_final).toBeCloseTo(7.56);
  });

  it('a média dos colegas entra como uma única fonte', () => {
    const linhas = [
      linha({ criterio_id: 1, valor: 10 }),
      linha({ papel: 'colega', avaliado_id: 10, valor: 6, avaliador_id: 1 }),
      linha({ papel: 'colega', avaliado_id: 10, valor: 10, avaliador_id: 2 }),
    ];
    const [k] = calcular(linhas, config);
    expect(k.memoria.fontes[3].valor).toBe(8);
  });

  it('ignora itens sem avaliação e renormaliza os pesos', () => {
    expect(mediaPonderada([
      { nome: 'a', peso: 30, valor: 8 },
      { nome: 'b', peso: 70, valor: null },
    ])).toBe(8);
    expect(mediaPonderada([{ nome: 'a', peso: 30, valor: null }])).toBeNull();
  });
});

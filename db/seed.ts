// Dados fictícios para demonstração (npm run seed).
// Critérios, pesos e escala são EXEMPLOS: substitua pelos definidos na especificação do TTG.
import bcrypt from 'bcryptjs';
import { fechar, query } from '../lib/db';

async function inserirUsuario(nome: string, email: string, matricula: string, perfil: string, senha = matricula) {
  const [u] = await query<{ id: number }>(
    'insert into usuario (nome, email, matricula, perfil, senha_hash) values ($1, $2, $3, $4, $5) returning id',
    [nome, email, matricula, perfil, await bcrypt.hash(senha, 10)],
  );
  return u.id;
}

async function main() {
  const [{ total }] = await query<{ total: number }>('select count(*)::int as total from usuario');
  if (total > 0) return console.log('O banco já tem dados; nada foi feito.');

  await inserirUsuario('Coordenação do TTG', 'coordenacao@cimatec.br', '0000', 'coordenacao', 'coord123');

  const orientadores: number[] = [];
  for (let i = 1; i <= 6; i++) orientadores.push(await inserirUsuario(`Orientador ${i}`, `orientador${i}@cimatec.br`, `O00${i}`, 'orientador'));

  // Estudantes A a S
  const estudantes: number[] = [];
  for (let i = 0; i < 19; i++) {
    const letra = String.fromCharCode(65 + i);
    estudantes.push(await inserirUsuario(`Estudante ${letra}`, `estudante.${letra.toLowerCase()}@cimatec.br`, `2026${100 + i}`, 'estudante'));
  }

  const [{ id: ciclo }] = await query<{ id: number }>(
    `insert into ciclo (semestre, modalidade, fase, janela_inicio, janela_fim, ativo)
     values ('2026.2', 'presencial', 1, '2026-10-01', '2026-11-20', true) returning id`,
  );

  // Seis componentes da nota da equipe (RN01) e um critério individual
  const componentes: [string, number, string][] = [
    ['Planejamento do projeto', 15, 'orientador'],
    ['Gestão do cronograma', 15, 'orientador'],
    ['Qualidade técnica da entrega', 25, 'orientador'],
    ['Documentação', 15, 'orientador'],
    ['Apresentação', 20, 'orientador'],
    ['Avaliação do projeto pelos estudantes', 10, 'estudante'],
  ];
  const criteriosEquipe: { id: number; fonte: string }[] = [];
  for (const [i, [nome, peso, fonte]] of componentes.entries()) {
    const [c] = await query<{ id: number }>(
      `insert into criterio (ciclo_id, tipo, nome, peso, fonte, ordem) values ($1, 'equipe', $2, $3, $4, $5) returning id`,
      [ciclo, nome, peso, fonte, i + 1],
    );
    criteriosEquipe.push({ id: c.id, fonte });
  }
  const [{ id: individual }] = await query<{ id: number }>(
    `insert into criterio (ciclo_id, tipo, nome, peso, ordem) values ($1, 'individual', 'Contribuição para o resultado da equipe', 100, 1) returning id`,
    [ciclo],
  );
  const escala = [['Insuficiente', 4], ['Regular', 6], ['Bom', 8], ['Ótimo', 10]] as const;
  for (const [rotulo, valor] of escala) {
    await query('insert into escala (ciclo_id, rotulo, valor) values ($1, $2, $3)', [ciclo, rotulo, valor]);
  }

  // Equipes do protótipo: [nome, primeiro estudante, quantidade, orient. gestão, orient. execução]
  const equipes: [string, number, number, number, number][] = [
    ['Equipe 01', 0, 5, 1, 4],
    ['Equipe 02', 5, 4, 2, 5],
    ['Equipe 03', 9, 5, 1, 6],
    ['Equipe 04', 14, 5, 3, 4],
  ];
  for (const [n, [nome, inicio, qtd, og, oe]] of equipes.entries()) {
    const membros = estudantes.slice(inicio, inicio + qtd);
    const gestao = orientadores[og - 1];
    const execucao = orientadores[oe - 1];
    const [{ id: equipe }] = await query<{ id: number }>(
      `insert into equipe (ciclo_id, nome, lider_id, orient_gestao_id, orient_execucao_id) values ($1, $2, $3, $4, $5) returning id`,
      [ciclo, nome, membros[0], gestao, execucao],
    );
    const avaliar = (avaliador: number, papel: string, avaliado: number | null, criterio: number, valor: number) =>
      query(
        `insert into avaliacao (ciclo_id, equipe_id, avaliador_id, papel, avaliado_id, criterio_id, valor)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [ciclo, equipe, avaliador, papel, avaliado, criterio, valor],
      );

    for (const m of membros) await query('insert into membro (ciclo_id, equipe_id, estudante_id) values ($1, $2, $3)', [ciclo, equipe, m]);

    // Avaliações fictícias determinísticas
    for (const [k, c] of criteriosEquipe.entries()) {
      const nota = 7 + ((n + k) % 4) * 0.5;
      if (c.fonte === 'orientador') {
        await avaliar(gestao, 'orient_gestao', null, c.id, nota);
        await avaliar(execucao, 'orient_execucao', null, c.id, nota + 0.5);
      } else {
        for (const m of membros) await avaliar(m, 'projeto', null, c.id, nota + 1);
      }
    }
    for (const [i, alvo] of membros.entries()) {
      const conceito = (desvio: number) => escala[Math.max(0, 3 - ((i + desvio) % 3))][1];
      await avaliar(gestao, 'orient_gestao', alvo, individual, conceito(0));
      await avaliar(execucao, 'orient_execucao', alvo, individual, conceito(1));
      for (const autor of membros) {
        await avaliar(autor, autor === alvo ? 'auto' : 'colega', alvo, individual, autor === alvo ? 10 : conceito(autor % 2));
      }
    }
  }

  console.log('Dados de exemplo criados.');
  console.log('  Coordenação: coordenacao@cimatec.br / coord123');
  console.log('  Orientador:  orientador1@cimatec.br / O001');
  console.log('  Estudante:   estudante.k@cimatec.br / 2026110');
}

main().finally(fechar);

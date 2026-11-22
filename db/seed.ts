// Dados fictícios para demonstração (npm run seed).
// Critérios, pesos e valores da escala são EXEMPLOS: as perguntas reais virão dos formulários do professor.
// As quatro perguntas do estudante sobre o projeto e as duas primeiras da autoavaliação seguem o
// formulário "Avaliação 360º - Equipe" mostrado na reunião de 19/11.
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

  const gestores: number[] = [];
  const executores: number[] = [];
  for (let i = 1; i <= 3; i++) {
    gestores.push(await inserirUsuario(`Orientador de Gestão ${i}`, `gestao${i}@cimatec.br`, `G00${i}`, 'gestao'));
    executores.push(await inserirUsuario(`Orientador de Execução ${i}`, `execucao${i}@cimatec.br`, `E00${i}`, 'execucao'));
  }

  // Estudantes A a S
  const estudantes: number[] = [];
  for (let i = 0; i < 19; i++) {
    const letra = String.fromCharCode(65 + i);
    estudantes.push(await inserirUsuario(`Estudante ${letra}`, `estudante.${letra.toLowerCase()}@cimatec.br`, `2026${100 + i}`, 'estudante'));
  }

  // Períodos: orientadores abertos; estudante com projeto/autoavaliação abertos e colegas terminando em breve;
  // nota ainda não liberada (a gestão libera na Configuração)
  const [{ id: ciclo }] = await query<{ id: number }>(
    `insert into ciclo (semestre, modalidade, fase, janela_inicio, janela_fim, ativo,
       peso_orient_gestao, peso_orient_execucao, peso_auto, peso_colegas,
       auto_inicio, auto_fim, colegas_inicio, colegas_fim, nota_liberada_em)
     values ('2026.2', 'presencial', 1, '2026-11-01', '2026-12-05', true, 25, 25, 25, 25,
       '2026-11-15', '2026-11-30', '2026-11-18', '2026-11-24', '2026-12-08') returning id`,
  );

  // Componentes da nota da equipe (somam 100)
  const componentes: [string, number, string][] = [
    ['Planejamento do projeto', 10, 'orientador'],
    ['Gestão do cronograma', 10, 'orientador'],
    ['Qualidade técnica da entrega', 15, 'orientador'],
    ['Documentação', 10, 'orientador'],
    ['Apresentação', 15, 'orientador'],
    ['Satisfação global com o projeto desenvolvido pela equipe', 5, 'estudante'],
    ['Satisfação com a qualidade técnica do projeto', 5, 'estudante'],
    ['Satisfação com a gestão do projeto (prospecção, planejamento e início da execução)', 5, 'estudante'],
    ['Satisfação com os aspectos relacionais e a postura profissional da equipe', 5, 'estudante'],
    ['Nota do cliente', 20, 'cliente'],
  ];
  // Critérios individuais (cada avaliador soma 100)
  const individuais: [string, number, string][] = [
    ['Desempenho individual global no desenvolvimento do projeto', 50, 'estudante'],
    ['Contribuição ao trabalho e à produção da equipe', 50, 'estudante'],
    ['Comprometimento e postura profissional', 50, 'gestao'],
    ['Cumprimento de prazos e entregas', 50, 'gestao'],
    ['Contribuição técnica', 50, 'execucao'],
    ['Qualidade das entregas técnicas', 50, 'execucao'],
  ];
  const criterios: { id: number; tipo: string; fonte: string }[] = [];
  for (const [tipo, lista] of [['equipe', componentes], ['individual', individuais]] as const) {
    for (const [i, [nome, peso, fonte]] of lista.entries()) {
      const [c] = await query<{ id: number }>(
        'insert into criterio (ciclo_id, tipo, nome, peso, fonte, ordem) values ($1, $2, $3, $4, $5, $6) returning id',
        [ciclo, tipo, nome, peso, fonte, i + 1],
      );
      criterios.push({ id: c.id, tipo, fonte });
    }
  }

  // Cinco níveis (reunião de 19/11); valor na escala de 0 a 10 para o cálculo
  const escala = [['Muito ruim', 2], ['Ruim', 4], ['Razoável', 6], ['Bom', 8], ['Muito bom', 10]] as const;
  for (const [rotulo, valor] of escala) {
    await query('insert into escala (ciclo_id, rotulo, valor) values ($1, $2, $3)', [ciclo, rotulo, valor]);
  }

  // [nome, primeiro estudante, quantidade, gestão, execução, cliente]
  const equipes: [string, number, number, number, number, string][] = [
    ['Equipe 01', 0, 5, 1, 1, 'Hospital Escola'],
    ['Equipe 02', 5, 4, 2, 2, 'Prefeitura Municipal'],
    ['Equipe 03', 9, 5, 1, 3, 'Indústria Química Alfa'],
    ['Equipe 04', 14, 5, 3, 1, 'Startup Beta'],
  ];
  for (const [n, [nome, inicio, qtd, og, oe, cliente]] of equipes.entries()) {
    const membros = estudantes.slice(inicio, inicio + qtd);
    const gestao = gestores[og - 1];
    const execucao = executores[oe - 1];
    const [{ id: equipe }] = await query<{ id: number }>(
      `insert into equipe (ciclo_id, nome, cliente, lider_id, orient_gestao_id, orient_execucao_id)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [ciclo, nome, cliente, membros[0], gestao, execucao],
    );
    const avaliar = (avaliador: number, papel: string, avaliado: number | null, criterio: number, valor: number) =>
      query(
        `insert into avaliacao (ciclo_id, equipe_id, avaliador_id, papel, avaliado_id, criterio_id, valor)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [ciclo, equipe, avaliador, papel, avaliado, criterio, valor],
      );
    for (const m of membros) await query('insert into membro (ciclo_id, equipe_id, estudante_id) values ($1, $2, $3)', [ciclo, equipe, m]);

    // Pendências de propósito, para a tela de Acompanhamento: a execução da Equipe 03 não avaliou
    // e os estudantes da Equipe 04 ainda não avaliaram os colegas
    const execucaoAvaliou = n !== 2;
    const colegasAvaliaram = n !== 3;
    const conceito = (k: number) => escala[2 + (k % 3)][1]; // Razoável, Bom ou Muito bom

    for (const [k, c] of criterios.entries()) {
      if (c.tipo === 'equipe') {
        const nota = 7 + ((n + k) % 4) * 0.5;
        if (c.fonte === 'orientador') {
          await avaliar(gestao, 'orient_gestao', null, c.id, nota);
          if (execucaoAvaliou) await avaliar(execucao, 'orient_execucao', null, c.id, nota + 0.5);
        } else if (c.fonte === 'cliente') {
          await avaliar(gestao, 'cliente', null, c.id, 8 + (n % 3) * 0.5);
        } else {
          for (const [i, m] of membros.entries()) await avaliar(m, 'projeto', null, c.id, conceito(n + k + i));
        }
        continue;
      }
      for (const [i, alvo] of membros.entries()) {
        if (c.fonte === 'gestao') await avaliar(gestao, 'orient_gestao', alvo, c.id, conceito(i + k));
        else if (c.fonte === 'execucao' && execucaoAvaliou) await avaliar(execucao, 'orient_execucao', alvo, c.id, conceito(i + k + 1));
        else if (c.fonte === 'estudante') {
          for (const [j, autor] of membros.entries()) {
            if (autor === alvo) await avaliar(autor, 'auto', alvo, c.id, 10);
            else if (colegasAvaliaram) await avaliar(autor, 'colega', alvo, c.id, conceito(i + j));
          }
        }
      }
    }
  }

  console.log('Dados de exemplo criados.');
  console.log('  Coordenação:            coordenacao@cimatec.br / coord123');
  console.log('  Orientador de gestão:   gestao1@cimatec.br / G001');
  console.log('  Orientador de execução: execucao1@cimatec.br / E001');
  console.log('  Estudante:              estudante.k@cimatec.br / 2026110');
}

main().finally(fechar);

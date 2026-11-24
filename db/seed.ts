// Dados fictícios para demonstração (npm run seed).
// As perguntas do estudante (projeto, autoavaliação e avaliação cruzada) são as do formulário
// "[PADRÃO] AOP-TTG FI Avaliação 360º - Equipe" do professor (recebido em 24/11).
// Critérios dos orientadores, pesos e valores numéricos da escala ainda são EXEMPLOS.
import bcrypt from 'bcryptjs';
import { fechar, query } from '../lib/db';

// Cursos do formulário do professor
const CURSOS = [
  'Arquitetura e Urbanismo', 'Engenharia Automotiva', 'Engenharia Civil', 'Engenharia de Computação',
  'Engenharia de Controle e Automação', 'Engenharia de Materiais', 'Engenharia de Produção', 'Engenharia Elétrica',
  'Engenharia Mecânica', 'Engenharia Química',
];

async function inserirUsuario(nome: string, email: string, matricula: string, perfil: string, senha = matricula, curso: string | null = null) {
  const [u] = await query<{ id: number }>(
    'insert into usuario (nome, email, matricula, perfil, curso, senha_hash) values ($1, $2, $3, $4, $5, $6) returning id',
    [nome, email, matricula, perfil, curso, await bcrypt.hash(senha, 10)],
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
    const matricula = `2026${100 + i}`;
    estudantes.push(await inserirUsuario(`Estudante ${letra}`, `estudante.${letra.toLowerCase()}@cimatec.br`, matricula, 'estudante', matricula, CURSOS[(i * 3) % CURSOS.length]));
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

  // [título curto, peso, quem avalia, texto da pergunta, texto em primeira pessoa (autoavaliação)]
  type Def = [string, number, string, string?, string?];

  // Componentes da nota da equipe (somam 100). Os dos orientadores e os pesos ainda são exemplos.
  const componentes: Def[] = [
    ['Planejamento do projeto', 10, 'orientador'],
    ['Gestão do cronograma', 10, 'orientador'],
    ['Qualidade técnica da entrega', 15, 'orientador'],
    ['Documentação', 10, 'orientador'],
    ['Apresentação', 15, 'orientador'],
    // Avaliação Geral do Trabalho em Equipe (formulário do professor)
    ['Satisfação global com o projeto', 5, 'estudante',
      'Qual você considera ser o seu grau de SATISFAÇÃO GLOBAL com o Projeto desenvolvido por sua equipe neste semestre, como um todo, analisando de maneira abrangente?'],
    ['Qualidade técnica do projeto', 5, 'estudante',
      'Qual o seu grau de satisfação com a QUALIDADE TÉCNICA do Projeto desenvolvido por sua equipe neste semestre?'],
    ['Gestão do projeto pela equipe', 5, 'estudante',
      'Qual o seu grau de satisfação com a GESTÃO DO PROJETO por parte de sua equipe? Ao responder, leve em consideração as etapas de prospecção, planejamento e o início da execução do projeto.'],
    ['Aspectos relacionais e postura profissional da equipe', 5, 'estudante',
      'Qual o seu grau de satisfação com os ASPECTOS RELACIONAIS e com a POSTURA PROFISSIONAL das e dos integrantes de sua equipe de projeto?'],
    ['Nota do cliente', 20, 'cliente'],
  ];

  // Critérios individuais (cada avaliador soma 100).
  // Estudante: as mesmas 5 questões na autoavaliação e na avaliação cruzada (formulário do professor).
  const individuais: Def[] = [
    ['Desempenho individual global', 20, 'estudante',
      'De maneira GLOBAL e considerando todo o semestre, como você avaliaria o desempenho individual de cada integrante de sua equipe?',
      'De maneira GLOBAL e considerando todo o semestre, como você avaliaria o seu desempenho individual no desenvolvimento do Projeto de sua equipe?'],
    ['Contribuição ao projeto', 20, 'estudante',
      'Considerando todo o semestre, como você avaliaria a CONTRIBUIÇÃO ao Projeto de cada integrante de sua equipe? Considere aqui a quantidade e qualidade do que produziu, sua contribuição na gestão do projeto, sua disponibilidade, assim como a quantidade de tempo e esforço que dedicou ao projeto de sua equipe.',
      'Considerando todo o semestre, como você avaliaria a sua CONTRIBUIÇÃO ao Projeto de sua equipe? Considere aqui a quantidade e qualidade do que produziu, sua contribuição na gestão do projeto, sua disponibilidade, assim como a quantidade de tempo e esforço que dedicou ao projeto de sua equipe.'],
    ['Gestão do projeto', 20, 'estudante',
      'Considerando todo o semestre, como você avaliaria o desempenho na GESTÃO DO PROJETO de cada integrante de sua equipe? Considere aqui aspectos como assiduidade, pontualidade, cumprimento de prazos acordados com a equipe e orientadores, assim como registro e compartilhamento de informações.',
      'Considerando todo o semestre, como você avaliaria o seu desempenho na GESTÃO DO PROJETO? Considere aqui aspectos como assiduidade, pontualidade, cumprimento de prazos acordados com a equipe e orientadores, assim como registro e compartilhamento de informações.'],
    ['Postura profissional', 20, 'estudante',
      'Com relação à POSTURA PROFISSIONAL, como você avalia o desempenho de cada integrante de sua equipe ao longo do semestre? Considere aqui aspectos como comprometimento, responsabilidade e seriedade na condução do projeto e no trato com a empresa demandante e orientadores.',
      'Com relação à POSTURA PROFISSIONAL, como você avalia seu desempenho ao longo do semestre? Considere aqui aspectos como comprometimento, responsabilidade e seriedade na condução do projeto e no trato com a empresa demandante e orientadores.'],
    ['Relações interpessoais', 20, 'estudante',
      'Com respeito às RELAÇÕES INTERPESSOAIS em sua equipe, como você avalia o desempenho de cada integrante de sua equipe ao longo do semestre? Considere aspectos como cordialidade e respeito no trato com colegas de equipe, assim como evitar e contribuir com a solução de conflitos.',
      'Com respeito às RELAÇÕES INTERPESSOAIS em sua equipe, como você avalia seu desempenho ao longo do semestre? Considere aspectos como cordialidade e respeito no trato com colegas de equipe, assim como evitar e contribuir com a solução de conflitos.'],
    // Orientadores: exemplos até chegarem os formulários deles
    ['Comprometimento e postura profissional', 50, 'gestao'],
    ['Cumprimento de prazos e entregas', 50, 'gestao'],
    ['Contribuição técnica', 50, 'execucao'],
    ['Qualidade das entregas técnicas', 50, 'execucao'],
  ];
  // Frases das pontas da escala, como no formulário (projeto e autoavaliação)
  const ANCORAS: Record<string, [string, string]> = {
    "Satisfação global com o projeto": ["Muito baixo. Decepcionante.", "Muito alto! Excelente experiência!"],
    "Qualidade técnica do projeto": ["Muito baixo. A produção da equipe neste semestre foi de muito baixa qualidade técnica.", "Muito alto! Considero que tudo o que produzimos neste semestre tem excelente qualidade técnica."],
    "Gestão do projeto pela equipe": ["Muito baixo! O projeto foi muito mal planejado e gerido.", "Muito alto! O projeto foi muito bem planejado e gerido."],
    "Aspectos relacionais e postura profissional da equipe": ["Muito baixo. A equipe teve baixo comprometimento e responsabilidade. Além disso, seus integrantes com frequência se portavam de maneira grosseira, desrespeitosa ou inadequada ao exercício profissional.", "Muito alto! A equipe sempre demonstrou comprometimento e responsabilidade. Além disso, seus integrantes sempre se portaram de maneira cordial, respeitosa e adequada ao exercício profissional."],
    "Desempenho individual global": ["Muito ruim.", "Muito bom!"],
    "Contribuição ao projeto": ["Muito baixa. Produzi pouco, não participei da gestão de projeto e dediquei muito menos tempo e esforço do que o restante da equipe.", "Muito alta! Contribuí de maneira relevante para as produções da equipe, participei ativamente da gestão do projeto e dediquei uma considerável quantidade de tempo e esforço ao projeto."],
    "Gestão do projeto": ["Muito ruim. Fui muito ausente, frequentemente me atrasei e perdi prazos, além de não ter me preocupado com o registro e compartilhamento de informações.", "Muito bom! Fui sempre presente, pontual e cumpridor de prazos, além de sempre registrar e compartilhar informações."],
    "Postura profissional": ["Muito ruim. Tive baixo comprometimento e responsabilidade com o projeto. Além disso, me equivoquei em alguns momentos no tratamento com a empresa demandante e orientadores.", "Muito bom! Tive alto grau de comprometimento e responsabilidade com o projeto. Além disso, sempre tratei a empresa demandante e orientadores de maneira cordial, respeitosa e adequada ao exercício profissional."],
    "Relações interpessoais": ["Muito ruim. Me equivoquei em diversos momentos no tratamento com meus colegas de equipe, provocando conflitos.", "Muito bom! Sempre me portei de maneira cordial e respeitosa, assim como contribuí para evitar e solucionar conflitos."],
  };

  const criterios: { id: number; tipo: string; fonte: string }[] = [];
  for (const [tipo, lista] of [['equipe', componentes], ['individual', individuais]] as const) {
    for (const [i, [nome, peso, fonte, descricao, descricaoAuto]] of lista.entries()) {
      const [c] = await query<{ id: number }>(
        `insert into criterio (ciclo_id, tipo, nome, peso, fonte, ordem, descricao, descricao_auto, ancora_min, ancora_max)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
        [ciclo, tipo, nome, peso, fonte, i + 1, descricao ?? null, descricaoAuto ?? null, ANCORAS[nome]?.[0] ?? null, ANCORAS[nome]?.[1] ?? null],
      );
      criterios.push({ id: c.id, tipo, fonte });
    }
  }

  // Cinco níveis (reunião de 19/11); valor na escala de 0 a 10 para o cálculo
  const escala = [['Muito ruim', 2], ['Ruim', 4], ['Razoável', 6], ['Bom', 8], ['Muito bom', 10]] as const; // rótulos do formulário
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

    // Comentários de exemplo (aparecem anônimos para gestão e coordenação)
    const comentar = (autor: number, tipo: string, texto: string) =>
      query('insert into comentario (ciclo_id, equipe_id, avaliador_id, tipo, texto) values ($1, $2, $3, $4, $5)', [ciclo, equipe, autor, tipo, texto]);
    await comentar(membros[0], 'projeto', 'A equipe se organizou bem nas entregas, mas a comunicação com o cliente demorou a engrenar.');
    await comentar(membros[1], 'auto', 'Poderia ter assumido mais tarefas de documentação.');
    if (colegasAvaliaram) {
      const primeira = criterios.find((c) => c.tipo === 'individual' && c.fonte === 'estudante')!;
      await comentar(membros[2], `colegas:${primeira.id}`, 'Todos participaram, mas a carga ficou concentrada em duas pessoas.');
      await comentar(membros[2], 'geral', 'A orientação de execução técnica foi muito útil; sugiro mais checkpoints com o cliente.');
    }
  }

  console.log('Dados de exemplo criados.');
  console.log('  Coordenação:            coordenacao@cimatec.br / coord123');
  console.log('  Orientador de gestão:   gestao1@cimatec.br / G001');
  console.log('  Orientador de execução: execucao1@cimatec.br / E001');
  console.log('  Estudante:              estudante.k@cimatec.br / 2026110');
}

main().finally(fechar);

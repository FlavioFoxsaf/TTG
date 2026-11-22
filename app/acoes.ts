'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { auditar, query, transacao } from '@/lib/db';
import { criarSessao, encerrarSessao, exigirPerfil, type Sessao } from '@/lib/auth';
import { cicloAtivo, comAviso, equipesDoUsuario, listarCriterios, listarEscala, membrosDaEquipe, papelPermitido } from '@/lib/dados';

// RF03: login; o perfil vem do cadastro do usuário
export async function entrar(form: FormData) {
  const email = String(form.get('email')).trim().toLowerCase();
  const [u] = await query<Sessao & { senha_hash: string }>(
    'select id, nome, perfil, senha_hash from usuario where email = $1',
    [email],
  );
  if (!u || !(await bcrypt.compare(String(form.get('senha')), u.senha_hash))) {
    redirect('/login?erro=' + encodeURIComponent('E-mail ou senha inválidos.'));
  }
  await criarSessao({ id: u.id, nome: u.nome, perfil: u.perfil });
  redirect('/');
}

export async function sair() {
  await encerrarSessao();
  redirect('/login');
}

// RF05: grava as avaliações de orientadores e estudantes
export async function salvarAvaliacoes(form: FormData) {
  const s = await exigirPerfil('orientador', 'estudante');
  const volta = String(form.get('volta'));
  const ciclo = await cicloAtivo();

  // RN07: só dentro da janela
  if (!ciclo?.janela_aberta) redirect(comAviso(volta, 'erro', 'A janela de avaliação está fechada.'));

  // RN05: só equipes sob responsabilidade do usuário
  const equipe = (await equipesDoUsuario(s, ciclo.id)).find((e) => e.id === Number(form.get('equipe')));
  if (!equipe) redirect(comAviso(volta, 'erro', 'Você não tem acesso a esta equipe.'));

  const membros = (await membrosDaEquipe(equipe.id)).map((m) => m.id);
  const criterios = new Map((await listarCriterios(ciclo.id)).map((c) => [c.id, c]));
  const valoresEscala = (await listarEscala(ciclo.id)).map((e) => e.valor);

  const registros: unknown[][] = [];
  for (const [campo, bruto] of form.entries()) {
    if (!campo.startsWith('v|') || bruto === '') continue;
    const [, alvo, criterioId] = campo.split('|');
    const avaliadoId = alvo ? Number(alvo) : null;
    const criterio = criterios.get(Number(criterioId));
    const valor = Number(bruto);
    const papel = criterio && papelPermitido(s, equipe, membros, avaliadoId, criterio);
    const valido = criterio?.tipo === 'equipe' ? valor >= 0 && valor <= 10 : valoresEscala.includes(valor);
    if (!papel || !valido) redirect(comAviso(volta, 'erro', 'Há valores inválidos no formulário.'));
    registros.push([ciclo.id, equipe.id, s.id, papel, avaliadoId, criterio!.id, valor]);
  }

  await transacao(async (q) => {
    for (const r of registros) {
      await q(
        `insert into avaliacao (ciclo_id, equipe_id, avaliador_id, papel, avaliado_id, criterio_id, valor)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (avaliador_id, equipe_id, avaliado_id, criterio_id)
         do update set valor = excluded.valor, papel = excluded.papel, atualizado_em = now()`,
        r,
      );
    }
  });
  await auditar(s.id, 'avaliacao', `${registros.length} valores na equipe ${equipe.nome}`);
  redirect(comAviso(volta, 'ok', 'Avaliação salva.'));
}

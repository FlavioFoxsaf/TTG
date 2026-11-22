import { exigirPerfil, NOME_PERFIL, type Perfil } from '@/lib/auth';
import { query } from '@/lib/db';
import { Aviso } from '@/components/Aviso';
import { importarUsuarios } from '../acoes';

// RF01 / HU01: importação da lista de matrícula
export default async function Estudantes({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await exigirPerfil('gestao');
  const usuarios = await query<{ id: number; nome: string; email: string; matricula: string; perfil: Perfil }>(
    `select id, nome, email, matricula, perfil from usuario where perfil <> 'coordenacao' order by perfil, nome`,
  );

  return (
    <>
      <Aviso busca={await searchParams} />
      <section className="cartao">
        <h2>Importar estudantes e orientadores</h2>
        <p className="suave">
          Arquivo CSV com as colunas <code>nome, email, matricula</code> e, opcionalmente, <code>perfil</code>{' '}
          (<code>estudante</code>, <code>gestao</code> para orientador de gestão de projetos ou <code>execucao</code> para
          orientador de execução técnica; vazio = estudante). A senha inicial de cada usuário é a matrícula. E-mails já cadastrados são atualizados.
        </p>
        <form action={importarUsuarios} className="linha" style={{ justifyContent: 'flex-start' }}>
          <input type="file" name="arquivo" accept=".csv,text/csv" required />
          <button className="botao">Importar</button>
        </form>
      </section>

      <section className="cartao">
        <h2>Usuários cadastrados ({usuarios.length})</h2>
        <table>
          <thead>
            <tr><th>Nome</th><th>E-mail</th><th>Matrícula</th><th>Perfil</th></tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}><td>{u.nome}</td><td>{u.email}</td><td>{u.matricula}</td><td>{NOME_PERFIL[u.perfil]}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

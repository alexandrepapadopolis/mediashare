# Remoção completa do Lovable do repositório

Este documento descreve, de forma **coesa, reproduzível e definitiva**, o processo utilizado para **isolar totalmente o projeto do Lovable**, incluindo a remoção do `lovable-dev[bot]` da lista de *Contributors* do GitHub por meio de **reescrita controlada do histórico**.

> ⚠️ **Aviso**: Este procedimento é destrutivo. Só é recomendado para repositórios novos, sem forks ou PRs relevantes.

---

## 1. Contexto

- Projeto originalmente gerado pelo **Lovable**
- Repositório novo
- Poucos commits
- Nenhum fork relevante
- Objetivo:  
  - Remover **qualquer vestígio técnico e histórico** do Lovable  
  - Tornar o projeto 100% independente

---

## 2. Limpeza do código e dependências

### 2.1 Remoções realizadas
- Referências a `lovable.dev`
- Dependência `lovable-tagger`
- Importações no `vite.config.ts`
- Metadados no `index.html`
- Conteúdo do README original

### 2.2 Verificação
```bash
git grep -n -I "lovable\|lovable.dev\|lovable-tagger\|Lovable" .
```

Resultado esperado: **nenhuma ocorrência**.

---

## 3. Problema: lovable-dev[bot] ainda aparece em Contributors

Mesmo após a limpeza do código, o GitHub continuava exibindo:

```
lovable-dev[bot] – 1 commit
```

Motivo:
> A lista de Contributors é derivada **exclusivamente do histórico de commits**, não do código atual.

---

## 4. Solução adotada: reescrita do histórico

### 4.1 Ferramenta utilizada
- `git-filter-repo` (recomendado oficialmente pelo Git)

Instalação no Windows:
```bash
py -m pip install --user git-filter-repo
```

Executável localizado em:
```
C:\Users\<usuario>\AppData\Roaming\Python\Python313\Scripts\git-filter-repo.exe
```

---

## 5. Identificação do autor Lovable

```bash
git log --format="%an <%ae> | %cn <%ce>" --all | findstr /I "lovable"
```

Resultado:
```
Lovable <noreply@lovable.dev> | Lovable <noreply@lovable.dev>
```

---

## 6. Script de reescrita (rewrite-authors.py)

```python
# rewrite-authors.py
def _run(commit):
    bot_emails = {"noreply@lovable.dev"}

    new_name = "Alexandre Vinhadelli Papadopolis"
    new_email = "alex@sbpi.com.br"

    def is_lovable(name_b, email_b):
        name = (name_b or b"").decode("utf-8", errors="ignore").strip().lower()
        email = (email_b or b"").decode("utf-8", errors="ignore").strip().lower()
        return (email in bot_emails) or (name == "lovable")

    new_name_b = new_name.encode("utf-8")
    new_email_b = new_email.encode("utf-8")

    if is_lovable(commit.author_name, commit.author_email):
        commit.author_name = new_name_b
        commit.author_email = new_email_b

    if is_lovable(commit.committer_name, commit.committer_email):
        commit.committer_name = new_name_b
        commit.committer_email = new_email_b

_run(commit)
```

---

## 7. Execução da reescrita

```bash
"C:\Users\<usuario>\AppData\Roaming\Python\Python313\Scripts\git-filter-repo.exe" ^
  --force --commit-callback "exec(open('rewrite-authors.py','rb').read())"
```

---

## 8. Verificação local

```bash
git log --format="%an <%ae> | %cn <%ce>" --all | findstr /I "lovable"
```

Resultado esperado: **nenhuma saída**.

---

## 9. Reconfiguração do remoto

O `git-filter-repo` remove o remote `origin` por segurança.

```bash
git remote add origin https://github.com/<usuario>/<repo>.git
```

---

## 10. Force push (destrutivo)

```bash
git push --force --all origin
git push --force --tags origin
```

---

## 11. Confirmação do remoto

```bash
git fetch origin --prune
git log origin/main --format="%an <%ae> | %cn <%ce>" --all | findstr /I "lovable"
```

Resultado: **nenhuma ocorrência**.

---

## 12. Recomputação dos Contributors no GitHub

Mesmo com o histórico limpo, o GitHub pode manter cache.

### Solução:
```bash
git commit --allow-empty -m "chore: trigger contributors recompute"
git push origin main
```

---

## 13. Resultado final

- ✅ Nenhum código do Lovable
- ✅ Nenhuma dependência do Lovable
- ✅ Nenhuma automação ativa
- ✅ Histórico reescrito
- ✅ `lovable-dev[bot]` removido de Contributors
- ✅ Projeto 100% independente

---

## 14. Considerações finais

Este procedimento **não deve ser repetido em repositórios maduros**.  
Ele foi apropriado **exclusivamente** por se tratar de um projeto novo, controlado e sem impacto externo.

Para projetos futuros, recomenda-se:
- Gerar scaffolding inicial
- Isolar imediatamente
- Evitar commits automatizados de ferramentas externas

---

**Documento gerado para fins de auditoria, rastreabilidade e governança técnica.**

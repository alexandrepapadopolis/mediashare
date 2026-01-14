# rewrite-authors.py
# Callback seguro para git-filter-repo (sem dependência de globais em escopo inesperado)

def _run(commit):
    bot_emails = {"noreply@lovable.dev"}  # manter local (não global)

    new_name = "Alexandre Vinhadelli Papadópolis"
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

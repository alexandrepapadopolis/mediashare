#!/usr/bin/env python3
import argparse
import json
import os
import re
import shlex
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

def slugify(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "issue"

def ensure_list(x: Any) -> List[Any]:
    return x if isinstance(x, list) else []

def load_plan(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def build_issue_body(step: Dict[str, Any], plan: Dict[str, Any]) -> str:
    step_id = step.get("step_id", "").strip()
    title = step.get("title", "").strip()
    desc = step.get("description", "").strip()
    deps = ensure_list(step.get("dependencies", []))

    # Links/refs inside repo
    refs = [
        "docs/architecture/ARCHITECTURE.md",
        "docs/architecture/phosio-mpa-ssr-plan.full.json",
    ]

    body_lines = []
    body_lines.append(f"## Objetivo\n{title}\n")
    body_lines.append("## Descrição\n" + (desc if desc else "-") + "\n")
    body_lines.append("## Dependências")
    if deps:
        body_lines.extend([f"- {d}" for d in deps])
    else:
        body_lines.append("- (nenhuma)")
    body_lines.append("")
    body_lines.append("## Referências")
    for r in refs:
        body_lines.append(f"- `{r}`")
    body_lines.append("")
    body_lines.append("## Checklist (ajuste conforme necessário)")
    body_lines.append("- [ ] Implementação concluída")
    body_lines.append("- [ ] Critérios de aceite atendidos (ver JSON)")
    body_lines.append("- [ ] Testes manuais executados (ver JSON)")
    body_lines.append("- [ ] Testes automatizados (se aplicável)")
    body_lines.append("")
    body_lines.append("## Notas")
    body_lines.append(f"- Gerado automaticamente em {datetime.now(UTC).isoformat()}Z")
    return "\n".join(body_lines)

def build_epic_body(steps: List[Dict[str, Any]], json_path: str) -> str:
    lines = []
    lines.append("## EPIC: Migração Phosio (SSR/MPA) — Tracking")
    lines.append("")
    lines.append("Este épico rastreia as issues geradas a partir do plano:")
    lines.append(f"- `{json_path}`")
    lines.append("")
    lines.append("### Checklist de execução (issues filhas)")
    for s in steps:
        sid = s.get("step_id", "").strip()
        stitle = s.get("title", "").strip()
        lines.append(f"- [ ] {sid} — {stitle}")
    lines.append("")
    lines.append("### Critérios gerais de pronto")
    lines.append("- SSR/MPA entregue (não-SPA)")
    lines.append("- Auth SSR com cookies httpOnly")
    lines.append("- Landing pública / + auth pages + /app catálogo")
    lines.append("- Hardening de segurança e validações")
    lines.append("- Testes mínimos (smoke + rotas + auth)")
    return "\n".join(lines)

def gh_cmd_create_issue(repo: Optional[str], title: str, body: str, labels: List[str]) -> str:
    cmd = ["gh", "issue", "create", "--title", title, "--body", body]
    if repo:
        cmd += ["--repo", repo]
    if labels:
        cmd += ["--label", ",".join(labels)]
    return " ".join(shlex.quote(x) for x in cmd)

def main() -> int:
    ap = argparse.ArgumentParser(description="Generate GitHub issues from Phosio plan JSON.")
    ap.add_argument("--json", required=True, help="Path to plan JSON (phosio-mpa-ssr-plan.full.json)")
    ap.add_argument("--repo", default=None, help="owner/repo for gh CLI (optional; default = current repo)")
    ap.add_argument("--labels", default="phosio,architecture,epic-candidate", help="Comma-separated labels to apply")
    ap.add_argument("--include-epic", action="store_true", help="Generate an EPIC tracking issue first")
    ap.add_argument("--out", default="gh-issues.sh", help="Output shell script path")
    ap.add_argument("--dry-run", action="store_true", help="Print commands to stdout only (no file)")
    args = ap.parse_args()

    plan = load_plan(args.json)
    steps = ensure_list(plan.get("plan", {}).get("implementation_steps", []))
    if not steps:
        print("ERROR: No plan.implementation_steps found in JSON.", file=sys.stderr)
        return 2

    labels = [x.strip() for x in args.labels.split(",") if x.strip()]

    commands: List[str] = []
    commands.append("#!/usr/bin/env bash")
    commands.append("set -euo pipefail")
    commands.append("")
    commands.append("# Auto-generated GitHub issue creation commands")
    commands.append("# Requirements: gh CLI authenticated and access to repository")
    commands.append("")

    if args.include_epic:
        epic_title = "EPIC: Phosio SSR/MPA migration"
        epic_body = build_epic_body(steps, args.json)
        commands.append(gh_cmd_create_issue(args.repo, epic_title, epic_body, ["phosio", "epic"]))
        commands.append("")

    for step in steps:
        sid = step.get("step_id", "").strip()
        stitle = step.get("title", "").strip()
        if not sid or not stitle:
            continue
        issue_title = f"{sid} — {stitle}"
        issue_body = build_issue_body(step, plan)
        commands.append(gh_cmd_create_issue(args.repo, issue_title, issue_body, labels))

    script = "\n".join(commands) + "\n"

    if args.dry_run:
        print(script)
        return 0

    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        f.write(script)
    os.chmod(args.out, 0o755)
    print(f"OK: wrote {args.out} with {len(steps) + (1 if args.include_epic else 0)} gh commands")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

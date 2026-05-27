---
name: install-skills
description: Install Claude Code skills from GitHub or a local dist package. Use when user wants to install skills, add a skill from a repo, copy skills to a project, or distribute skills globally.
---

# Install Skills

## From GitHub (recommended)

```bash
npx skills add <github-user>/<repo>
```

Example:
```bash
npx skills add pbakaus/impeccable
```

This clones the repo, detects skills, and symlinks them into Claude Code automatically.

## From a local dist package

**Project-specific:**
```bash
cp -r dist/claude-code/.claude your-project/
```

**Global (all projects):**
```bash
cp -r dist/claude-code/.claude/* ~/.claude/
```

## Workflow

1. If the user has a GitHub repo name, use `npx skills add` — it's one command and handles everything.
2. If installing from a local build, ask: project-specific or global?
3. Verify after install:
```bash
ls .agents/skills/          # npx skills add
ls your-project/.claude/skills/   # project cp
ls ~/.claude/skills/               # global cp
```

## Notes

- `npx skills add` installs to `.agents/skills/` and symlinks into Claude Code
- Security risk assessments are shown during install — review before accepting
- Global cp install overwrites existing files with the same name

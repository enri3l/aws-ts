# TypeScript Template

A minimal template for TypeScript projects.

## What’s inside

- Strict TypeScript setup (`tsconfig.json`) and basic `src/` scaffold
- ESLint (flat config) and Prettier formatting
- Commit message linting (Commitlint) and conventional commits
- Git hooks via Lefthook (e.g., linting on commit)
- Markdownlint configuration for docs consistency
- GitHub Actions workflows for CI checks
- Release configuration for automated versioning and changelog
- pnpm workspace configuration
- VS Code settings and recommended extensions
- Project hygiene: `.editorconfig`, `.gitattributes`, `.gitignore`, `.npmrc`, `LICENSE`

## Structure

```bash
├─ src/ # application source
├─ .github/workflows/ # CI workflows
├─ .vscode/ # editor settings
└─ config files… # eslint, prettier, commitlint, tsconfig, etc.
```

## License

MIT

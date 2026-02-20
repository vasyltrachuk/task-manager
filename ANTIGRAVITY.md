# Code Guidelines

## Core Principles

Apply these principles to every piece of code written in this project:

### KISS — Keep It Simple, Stupid
- Write the simplest solution that solves the problem
- Avoid premature abstraction and over-engineering
- If you need a comment to explain what code does — simplify the code first
- Prefer 3 clear lines over 1 clever line

### DRY — Don't Repeat Yourself
- Extract repeated logic into a shared utility immediately
- Never copy-paste code — find the right place and reuse it
- One source of truth for every piece of logic

### SOLID
- **S** — Each function/module has one responsibility
- **O** — Extend behavior without modifying existing code
- **L** — Subtypes must be substitutable for their parent types
- **I** — Don't depend on interfaces you don't use
- **D** — Depend on abstractions, not concrete implementations

### SSOT — Single Source of Truth
- Every piece of data or logic lives in exactly one place
- Types defined in `src/lib/types.ts`, utilities in `src/lib/utils.ts` (or domain-specific `src/lib/*.ts`)
- Never duplicate constants, labels, or business rules across files

### Modularity
- Group code by domain, not by technical layer
- Each file has a clear, single concern
- Avoid god-files; split when a file grows beyond its responsibility

---

## Mandatory Rules

### Name Formatting
- **Always** use `formatShortName(fullName)` from `src/lib/utils.ts` to display person names in UI
- Format: «Прізвище І.Б.» (e.g. «Шевченко Т.Г.»)
- Never inline name-shortening logic — SSOT/DRY
- Full `full_name` is stored in DB; short form is display-only

### Utilities
- New shared utilities go into `src/lib/utils.ts` or a dedicated `src/lib/<domain>.ts`
- Never write a helper inline if it will be used in more than one place

### Types
- All shared types live in `src/lib/types.ts`
- No `any` — use proper types or `unknown` with narrowing

### No Over-Engineering
- Don't add features, refactors, or abstractions beyond what was asked
- Don't add error handling for impossible cases
- Don't create helpers for one-time operations

# Repository consolidation (monorepo migration)

_Performed 2026-11-17._

## Before

```
wanderluxe/                    plain folder, not a repository
├── travel-back/  .git  main @ c2dbdbf (34 commits)  remote git@github.com:ArnoSahakyan/travel-back.git
├── travel-front/ .git  main @ ed9a653 (81 commits)  remote git@github.com:ArnoSahakyan/travel-front.git
└── wanderluxe.sql
```

Pre-flight checks, all clean:
- Both working trees were clean: no uncommitted or staged changes, no stashes, no tags.
- Every remote branch was already merged into `main`. `git rev-list --count main..<branch>` returned 0 for:
  - backend: `dev`, `development`, `sequelize-cli-setup`
  - frontend: `admin-panel`, `blogs-fix`, `bookings-improvement`, `dev`, `match-backend-changes`, `search`
- Neither history ever contained an `.env` file or credentials.
- `git fsck` was clean.

## Backups (taken before any change)

All in `.backup/` (git-ignored, mode 700):

| File | What | How to use |
|---|---|---|
| `travel-back.bundle`, `travel-front.bundle` | Complete repos (`git bundle --all`): every branch, remote-tracking ref and object. Verified with `git bundle verify`. | `git clone travel-back.bundle restored-back` |
| `original-folders.tar.gz` | Both folders as they were (without `node_modules`), plus the dump and `.idea/` | `tar -xzf …` |
| `original-repos/travel-back`, `original-repos/travel-front` | The original working copies, **including their `.git` directories and remotes**, moved here after the merge was verified | can still `git pull` / `git push` from them if ever needed |
| `env/travel-back.env`, `env/travel-front.env` | The original production `.env` files, unmodified, mode 600 | production configuration reference |
| `wanderluxe.sql.sha256` | Checksum of the supplied dump | `cd database/dump && sha256sum -c ../../.backup/wanderluxe.sql.sha256` |

## Strategy: subtree merge (history preserved, nothing rewritten)

Options considered:

| Option | Keeps original SHAs | Per-file `git log` without flags | Rewrites history | Decision |
|---|---|---|---|---|
| Copy files into a fresh repo | – (history lost) | – | – | rejected |
| `git filter-repo --to-subdirectory-filter` then merge | ✗ (every commit gets a new SHA) | ✓ | **yes** | rejected: the brief says not to rewrite history without a clear reason |
| `git subtree add` | ✓ | ✗ | no | equivalent to the manual subtree merge below |
| **`merge -s ours` + `read-tree --prefix`** (manual subtree merge) | **✓** | ✗ (use `--follow` or the archive tag) | **no** | **chosen** |

Commands run from the parent folder:

```bash
git init -b main
git config user.name  "ArnoSahakyan"            # repository-level only
git config user.email "sahakyan.arno@gmail.com"
git commit -m "chore: initialize monorepo root"   # adds the root .gitignore

for pair in travel-back:backend travel-front:frontend; do
  src=${pair%%:*}; dst=${pair##*:}
  git remote add import-$src ./$src
  git fetch import-$src main
  git merge -s ours --no-commit --allow-unrelated-histories import-$src/main
  git read-tree --prefix=$dst/ -u import-$src/main
  git commit -m "chore: import $src history into $dst/"
  git tag -a archive/$src-main import-$src/main -m "Final $src main before monorepo consolidation"
  git remote remove import-$src
done
```

Verification:
- `git diff archive/travel-back-main^{tree} HEAD:backend` and `git diff archive/travel-front-main^{tree} HEAD:frontend` were both empty, so the imported trees are byte-identical to the originals.
- 118 commits are reachable: 34 + 81 imported, 1 root commit, 2 merge commits.
- Authors and dates of historical commits are unchanged (`Arno` / `ArnoSahakyan <sahakyan.arno@gmail.com>`).
- After verification, the original folders were moved to `.backup/original-repos/`. `find . -name .git` now finds only `./.git`.

## Resulting layout

```
wanderluxe/        one .git
├── backend/       ← travel-back
├── frontend/      ← travel-front
├── database/      dump (ignored), baseline schema, docker init, scripts
├── docs/
├── docker-compose.yml
├── package.json   npm workspaces
└── .gitignore     single root ignore file (the two nested ones were removed)
```

- Folder names follow the requested `frontend/` / `backend/` structure.
- The npm package names (`wanderluxe-back`, `wanderluxe-frontend`) were kept.

## Working with the old history

```bash
git log archive/travel-back-main                    # backend history as it was
git log --oneline -- backend/                       # commits made after consolidation
git log --follow -- backend/src/app.ts              # one file across the move
git blame archive/travel-front-main -- src/App.tsx  # blame as of the old layout
```

## Remotes

- The new repository has **no remote**. Nothing was pushed, and the two GitHub repositories are untouched.
- When you're ready, create a new GitHub repository and push:

  ```bash
  git remote add origin git@github.com:ArnoSahakyan/wanderluxe.git
  git push -u origin main --follow-tags
  ```
- Optionally, archive `travel-back` / `travel-front` on GitHub with a README link to the new repository. Don't delete them until the new one is published.

## Package manager

- Both packages are now **npm workspaces** with a single root `package-lock.json`.
- The old lock files were removed: `backend/yarn.lock`, `frontend/yarn.lock` and `frontend/package-lock.json`. Having both a yarn and an npm lock file was a source of drift.
- Install with `npm install` (or `npm ci` in CI) from the repository root.

## Docker decision

Docker Compose runs **only stateful infrastructure**: PostgreSQL and Mailpit.
- The Node apps run on the host, where `tsx watch` and Vite give instant hot reload without bind-mount or `node_modules`/native-binary (`sharp`) problems.
- Docker is used for the database, but you can use a native PostgreSQL instead (LOCAL_DEVELOPMENT.md §8).

No production Dockerfiles were added:
- The frontend already deploys to Vercel (`vercel.json`).
- There is no backend deployment target in the repository to design for.

A minimal backend image, if one is ever needed:
1. `npm ci --omit=dev -w backend` on `node:24-slim`
2. copy `backend/dist`
3. run `node --import tsx dist/index.js`

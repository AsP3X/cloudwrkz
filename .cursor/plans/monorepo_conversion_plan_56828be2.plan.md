---
name: Monorepo conversion plan
overview: Convert the Cloudwrkz workspace from two independent git repositories (CloudwrkzApp and cloudwrkz) into a single-root monorepo with no submodules, using a standard apps/ layout and root-level workspace tooling.
todos: []
isProject: false
---

# Monorepo conversion plan (no submodules)

## Current state

- **Workspace root** (`Cloudwrkz`): Not a git repo; holds two separate projects.
- **CloudwrkzApp/**: Own `.git`; iOS/Swift app (Xcode project, 81 Swift files, Cloudwrkz.xcodeproj).
- **cloudwrkz/**: Own `.git`; Next.js app with pnpm, Prisma, TypeScript; has `.github/workflows`, Dockerfile, and `.devcontainer`.

There are no git submodules today (no `.gitmodules`). The goal is a single repository with both apps as sibling directories under a shared root, with no nested repos.

## Target layout

```
Cloudwrkz/                    # single git root
├── .git/                      # one repo only
├── .gitignore                 # merged from both projects
├── README.md                  # root overview + links to apps
├── pnpm-workspace.yaml        # pnpm workspace (web app only)
├── package.json               # optional: root scripts
├── apps/
│   ├── web/                   # current cloudwrkz (Next.js)
│   │   ├── package.json
│   │   ├── prisma/
│   │   ├── src/
│   │   ├── Dockerfile
│   │   ├── .devcontainer/
│   │   └── ...
│   └── ios/                   # current CloudwrkzApp (Xcode)
│       ├── Cloudwrkz.xcodeproj/
│       ├── Cloudwrkz/
│       ├── CloudwrkzTests/
│       ├── CloudwrkzUITests/
│       └── ...
└── .github/
    └── workflows/             # moved from apps/web, paths updated
        └── docker-image-build.yml
```

Naming: `apps/web` and `apps/ios` keeps the layout generic and matches common monorepo conventions. Alternatives: `apps/cloudwrkz` and `apps/cloudwrkz-ios` if you prefer product names in paths.

## Implementation steps

### 1. Create root git and directory layout

- Initialize git at workspace root: `git init` in `Cloudwrkz`.
- Create `apps/` and move existing content:
  - Move `cloudwrkz` → `apps/web` (or `apps/cloudwrkz`).
  - Move `CloudwrkzApp` → `apps/ios` (or `apps/cloudwrkz-ios`).
- Remove nested `.git` directories so there are no submodules and no nested repos:
  - Delete `apps/web/.git` (formerly `cloudwrkz/.git`).
  - Delete `apps/ios/.git` (formerly `CloudwrkzApp/.git`).

### 2. Root workspace and scripts

- Add [pnpm-workspace.yaml](pnpm-workspace.yaml) at repo root with one package, e.g.:

```yaml
  packages:
    - 'apps/web'
  

```

  (If you name the folder `apps/cloudwrkz`, use `'apps/cloudwrkz'`.)

- Optional root [package.json](package.json): add scripts that delegate to the web app, e.g. `"dev": "pnpm --filter web dev"`, `"build": "pnpm --filter web build"`, and `lint/build for ios` via a note or script that runs xcodebuild. Ensures one place to run common commands from root.
- In `apps/web/package.json`, set `"name": "web"` (or `"cloudwrkz"`) so pnpm filters work.

### 3. Single root .gitignore

- Create one [.gitignore](.gitignore) at repo root that merges:
  - From current [cloudwrkz/.gitignore](cloudwrkz/.gitignore): `node_modules`, `.next/`, `.env*.local`, `.vercel`, Prisma migrations and generated output, `public/uploads/`, etc. Use patterns that are relative to the whole repo (e.g. `**/node_modules`, `**/.next/`, `apps/web/.env*.local` or `**/.env*.local`).
  - From current [CloudwrkzApp/.gitignore](CloudwrkzApp/.gitignore): `References/`, `xcuserdata/`, `*.xcuserstate`.
- Remove or keep `apps/web/.gitignore` and `apps/ios/.gitignore` as supplemental if desired; root should cover everything that must not be committed.

### 4. Update CI (GitHub Actions)

- Move [cloudwrkz/.github/workflows/docker-image-build.yml](cloudwrkz/.github/workflows/docker-image-build.yml) to [.github/workflows/docker-image-build.yml](.github/workflows/docker-image-build.yml).
- In that workflow, set Docker build context and Dockerfile path to the web app directory, e.g.:
  - `context: apps/web` (or `apps/cloudwrkz`).
  - `file: apps/web/Dockerfile` (or `apps/cloudwrkz/Dockerfile`).
- If the workflow or Dockerfile assumes “repo root = app root” (e.g. copying `package.json` or `prisma/`), ensure the Dockerfile’s `COPY` and `WORKDIR` are correct when built from `apps/web`; often the Dockerfile already uses relative paths, so building with `context: apps/web` keeps behavior the same.

### 5. Update Docker and devcontainer paths

- [apps/web/docker-compose.yml](cloudwrkz/docker-compose.yml): Update volume mount that today points to `/home/cloudwrkz/docker/...` to the new path if you use it for local dev (e.g. mount the monorepo or `apps/web` as appropriate). The compose file is used in different environments; only change paths that assume “cloudwrkz is repo root.”
- [apps/web/.devcontainer/docker-compose.yml](cloudwrkz/.devcontainer/docker-compose.yml): Currently mounts `../..:/workspaces`. After the move, `../..` from `apps/web/.devcontainer` is the monorepo root, so the same mount still works. No change required unless you want to expose only `apps/web` in the container.
- [apps/web/.devcontainer](cloudwrkz/.devcontainer): If devcontainer.json has `workspaceFolder` or `workspaceMount`, confirm they still point at the intended folder (monorepo root or `apps/web`).

### 6. Paths and config inside apps/web

- Scripts in [apps/web/package.json](cloudwrkz/package.json) use relative paths (e.g. `prisma generate`, `next dev`). They run from `apps/web`, so no change.
- [apps/web/tsconfig.json](cloudwrkz/tsconfig.json) path alias `@/*` → `./src/*` remains valid.
- Any script or config that references the repo root (e.g. for shared tooling) should use `../../` from `apps/web` to reach root.

### 7. iOS app (apps/ios)

- Xcode project paths in [Cloudwrkz.xcodeproj/project.pbxproj](CloudwrkzApp/Cloudwrkz.xcodeproj/project.pbxproj) are relative to the project file. Moving the whole `CloudwrkzApp` tree into `apps/ios` keeps those relative paths valid; no code changes required.
- Open the app via `apps/ios/Cloudwrkz.xcodeproj` after the move.

### 8. Root README

- Add a root [README.md](README.md) that:
  - Describes the monorepo (web app + iOS app).
  - Links to `apps/web` and `apps/ios` with short setup instructions (e.g. pnpm in `apps/web`, Xcode for `apps/ios`).
  - Documents how to run dev/build from root if you add root package.json scripts.

### 9. First commit and history (optional)

- If you need to preserve git history from one or both existing repos, use `git subtree` or `git filter-repo` to bring in history from the old `cloudwrkz` and `CloudwrkzApp` repos into `apps/web` and `apps/ios` before or after the move. If you do not need history, a single initial commit with the new layout is enough.

## Summary


| Action                                                     | Where                |
| ---------------------------------------------------------- | -------------------- |
| Init git at root, create `apps/`                           | Repo root            |
| Move `cloudwrkz` → `apps/web`, `CloudwrkzApp` → `apps/ios` | Repo root            |
| Remove `apps/web/.git` and `apps/ios/.git`                 | No submodules        |
| Add `pnpm-workspace.yaml`, optional root `package.json`    | Root                 |
| Merge and add root `.gitignore`                            | Root                 |
| Move and edit Docker workflow (context/file)               | `.github/workflows/` |
| Adjust Docker/devcontainer if needed                       | `apps/web`           |
| Add root README                                            | Root                 |


After this, you have one repo, no submodules, and a clear `apps/web` and `apps/ios` layout with root-level pnpm and CI wired to the web app.
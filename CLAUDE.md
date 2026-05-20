# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mini-Jira on AWS — a team task-management web app for a university cloud computing course (Dr. John Zaki, deadline 22/5/2026). Spec is in `cloud-project-description.md`. Implementation plan is in `docs/superpowers/plans/2026-05-20-mini-jira-aws.md`.

## Commands

```bash
# Development (run in separate terminals)
cd backend && npm run dev          # Express API on :3001 (tsx watch)
cd frontend && npm run dev         # Vite React on :5173 (proxies /api → :3001)

# DynamoDB Local (must be running before backend)
java "-Djava.library.path=./local-dynamodb/DynamoDBLocal_lib" -jar ./local-dynamodb/DynamoDBLocal.jar -sharedDb -port 8000

# Setup
npm run create-tables              # Create 6 DynamoDB tables locally
npm run seed                       # Seed teams (Frontend/Backend/QA) + project

# Type checking
cd backend && npx tsc --noEmit
cd frontend && npx tsc -b --noEmit

# Build
cd frontend && npx vite build      # Static SPA → frontend/dist/
cd backend && npx tsc              # Compiled JS → backend/dist/

# Cognito user setup (needs AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY env vars)
npx tsx scripts/setup-cognito-users.ts
```

## Architecture

**Monorepo**: `backend/` (Express+TS), `frontend/` (React+Vite+Tailwind+shadcn/ui), `lambdas/` (3 Lambda functions), `scripts/` (setup/seed).

**Auth flow**: Cognito JWT → `auth.ts` middleware verifies token → extracts userId/role/teamId → `syncFromToken` creates DynamoDB user on first login → `teamGuard.ts` sets `req.teamFilter` (null for managers, teamId for employees).

**Team isolation** (highest-risk graded item): Every route handler checks `req.teamFilter`. Employees query via `teamId-index` GSI — they cannot access other teams' data even by guessing IDs. Managers bypass with `teamFilter = null`. When manager reassigns a user's team, both DynamoDB AND Cognito `custom:teamId` are updated.

**Auth is optional locally**: If `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID` are not set, auth middleware is skipped (all routes open).

**Frontend routing**: Vite proxy sends `/api/*` to backend. In production, CloudFront serves SPA from S3 (default origin) and routes `/api/*` to ALB (second origin).

## DynamoDB Tables

- **Users** (PK: userId) — GSI: teamId-index
- **Teams** (PK: teamId) — teamId = lowercase team name (matches Cognito custom:teamId)
- **Projects** (PK: projectId)
- **Tasks** (PK: taskId) — GSIs: teamId-index, assigneeId-index, projectId-index
- **Comments** (PK: taskId, SK: commentId)
- **ActivityLog** (PK: taskId, SK: timestamp) — audit trail for status changes

**Important**: DynamoDB rejects empty strings in GSI key attributes. `TaskModel.stripEmpty()` removes them before writes.

## Key Patterns

- All route handlers use `asyncHandler` wrapper (catches async errors)
- Routes use `AuthRequest` type (extends Express Request with `user` and `teamFilter`)
- Manager-only mutations: check `if (req.teamFilter) return 403`
- Task status: TODO → IN_PROGRESS → IN_REVIEW → DONE. `closedAt` auto-set on DONE.
- Activity logging: TaskModel logs CREATED/STATUS_CHANGE via ActivityLogModel
- Comments route uses `Router({ mergeParams: true })` to access `:taskId` from parent

## AWS Region & Demo Users

Region: **eu-central-1** (Frankfurt). Cognito User Pool: `eu-central-1_hzNncGJkv`.

Demo scenario (must work on demo day):
- **Ali** (MANAGER, team: all) — sees all tasks, creates/assigns tasks
- **Sara** (EMPLOYEE, team: frontend) — sees only Frontend tasks
- **Omar** (EMPLOYEE, team: backend) — sees only Backend tasks

## Milestone Progress

- [x] M1: Project skeleton + DynamoDB models (local)
- [x] M2: Cognito auth + team isolation middleware
- [x] M3: Full CRUD + Kanban UI with drag-and-drop + redesigned UI
- [ ] M4: S3 image upload + Lambda resize
- [ ] M5: SNS/SQS task assignment events + EventBridge daily digest
- [ ] M6: CloudWatch dashboard (4 widgets) + alarm
- [ ] M7: AWS deployment (VPC 2 AZs, EC2/ASG, ALB, CloudFront)
- [ ] M8: Architecture diagram, README, seed script, demo prep

## Cost Constraints

AWS Free Tier only. NAT Instance (t2.micro) instead of NAT Gateway. Stop EC2/ALB when not testing. No services that charge per-hour outside Free Tier.

## User Preferences

- Never assume decisions — ask first (stack, cost, architecture tradeoffs)
- Full spec compliance — no shortcuts or easy fixes
- The user does all AWS console/CLI work manually (learning for evaluation)
- Code provides step-by-step AWS setup instructions for the user to follow
- Use subagent-driven development for parallelizable work
- Use /ui-ux-pro-max and /frontend-design skills for UI work

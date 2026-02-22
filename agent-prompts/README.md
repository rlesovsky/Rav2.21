# Agent Prompts — Separator Energy Cost Dashboard
## Driftwood Dairy | El Monte, CA | Texas Automation Systems

This folder contains all AI agent prompts used in the development and operation
of the Separator Energy Cost Dashboard. Each prompt is in its own file and
organized by role. Load the appropriate prompt when starting a new Claude session
for that task.

---

## Prompt Index

| File | Role | When to Use |
|------|------|-------------|
| `01_project_context.md` | Project Context | Load first in every session |
| `02_backend_developer.md` | Backend Dev Agent | Building FastAPI + TimeBase client |
| `03_frontend_developer.md` | Frontend Dev Agent | Building React dashboard |
| `04_data_engineer.md` | Data Engineer Agent | Historian queries + state logic |
| `05_debugger.md` | Debugging Agent | Troubleshooting API or calc issues |

---

## How to Use

1. Start every Claude session by pasting `01_project_context.md`
2. Then paste the role-specific prompt for the task you are working on
3. Provide your specific question or code after the prompts

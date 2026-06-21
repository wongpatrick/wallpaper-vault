---
name: pull-next-kanban-task
description: >-
  Pulls the next Ready/To Refine task from the Kanban board, updates the board file to mark it In Progress, runs lint/test suites, and kicks off the design plan process.
---

# Pull Next Kanban Task

## Overview
This skill automates the process of pulling the next task from the Kanban board `c:\Obsidian-Vaults\Notes\Wallpaper-Vault Kanban.md`, moving it to the `In Progress` list, running backend/frontend validation checks, and starting the implementation design planning phase.

## Quick Start
To trigger this skill, the user can ask:
- "Pull the next task from the Kanban board."
- "Move the next ready task to in progress and start the design plan."

## Workflow

### 1. File Validation
Verify that the following resources exist:
- Kanban file: `c:\Obsidian-Vaults\Notes\Wallpaper-Vault Kanban.md`
- Repository root: `c:\Projects\wallpaper-vault`

If either is missing, the agent **MUST** fail immediately and report the missing paths.

### 2. Transition Kanban Task
Run the local python script using `uv run` to pop the next task:
```bash
uv run python .agents/skills/pull-next-kanban-task/scripts/kanban_helper.py pop-task --board-path "c:\Obsidian-Vaults\Notes\Wallpaper-Vault Kanban.md" --output "c:\Projects\wallpaper-vault\.agents\skills\pull-next-kanban-task\scripts\popped_task.json"
```

The script will search for the top task under `## Ready`. If `## Ready` has no remaining tasks, it will pull the top task from `## To Refine`. It will automatically move the popped task to `## In Progress` in the Kanban board.

If the output json contains `"status": "empty"`, report to the user that no tasks are available on the board and stop.

### 3. Implementation Design & Planning
Based on the details in `popped_task.json`:
- Create the task checklist file `task.md` and design plan `implementation_plan.md` in the current conversation directory.
- For `implementation_plan.md`, formulate the design approach, potential architecture impact, and highlight any necessary decisions.
- Add delegate subagents where appropriate to help parallelize, research, or audit work.
- Initiate the `/grill-me` process to interview the user about design choices. If the popped task was from the `To Refine` section, prioritize initial research and ask exploratory questions.

### 4. Verification & Review
After implementation, ensure validation checks and quality control are performed:
- **Backend Linting**: `uv run ruff check` in `c:\Projects\wallpaper-vault\backend`
- **Backend Tests**: `uv run pytest` in `c:\Projects\wallpaper-vault\backend`
- **Frontend Linting**: `npm run lint` in `c:\Projects\wallpaper-vault\frontend`
- **Subagent Review**: Spawn a new subagent to review the completed code modifications, checking for potential bugs, styling inconsistencies, and architectural alignment.

## Common Mistakes
- **Failing to check To Refine**: Make sure to check the `To Refine` section if `Ready` is empty rather than failing.
- **Not Wait-approving**: Always wait for user approval on the implementation plan before making modifications to the source code.



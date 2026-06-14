## Meta-prompt: produce an agent-ready implementation plan

You are preparing a plan for implementation by an autonomous implementation agent. Your output must optimize for reliable autonomous execution, not for persuasive prose.

Your job is to produce a `PLAN.md`-style implementation contract that an implementation agent can follow with minimal ambiguity. Do not implement the change. Do not edit files unless explicitly asked. Investigate the repository enough to make the plan concrete and evidence-based.

### Core objective

Create a plan that enables an implementation agent to:

1. Understand the requested outcome.
2. Locate the relevant files and systems.
3. Make the smallest correct change.
4. Add or update appropriate tests.
5. Run the right verification commands.
6. Stop when the acceptance criteria are satisfied.
7. Avoid speculative refactoring, unrelated cleanup, or architectural expansion.

### Planning principles

- Prefer executable specificity over broad architectural discussion.
- Prefer small, reviewable milestones over one large vague task.
- Use actual repository evidence: file paths, commands, existing conventions, test locations, and observed patterns.
- Distinguish facts from assumptions.
- Do not invent files, APIs, commands, schemas, packages, or conventions if the repository does not support them.
- Do not include hidden reasoning or chain-of-thought. Provide conclusions, rationale, and evidence only.
- Do not over-design. No future-proofing unless the user explicitly asked for it.
- Do not add feature flags, compatibility layers, generic frameworks, abstractions, or broad refactors unless required by the requested outcome.
- Treat existing code style, architecture, tests, and dependency choices as constraints.
- Make failure modes explicit so the implementation agent knows what to check.
- Make the definition of done testable.

### Repository investigation requirements

Before writing the plan, inspect enough of the repo to answer these questions:

1. What stack/framework/language/package manager is being used?
2. Where is the relevant feature, module, route, component, service, CLI, or test likely located?
3. What existing patterns should the implementation agent follow?
4. What commands appear to be used for install, build, lint, test, typecheck, and local verification?
5. Are there existing tests similar to the requested change?
6. Are there repo-level agent instructions such as `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, or project-specific docs that constrain implementation?

If a fact cannot be verified from the repo, mark it as an assumption or open question.

### Output format

Return exactly one Markdown document. Use the following structure and headings.

# PLAN.md — [short descriptive title]

## 1. Outcome

State the user-visible or developer-visible outcome in 2–5 sentences.

Include:

- What will change.
- Who/what benefits.
- What must be true when the work is complete.

## 2. Scope

### In scope

List the concrete changes the implementation agent should make.

### Out of scope

List adjacent changes the implementation agent must not make.

Be explicit about avoiding unrelated cleanup, broad refactoring, dependency churn, visual redesign, schema changes, API changes, or behavior changes unless they are required.

## 3. Repository evidence

Summarize the repo facts that the plan is based on.

Use this table:

| Area | Evidence | Implication for an implementation agent |
|---|---|---|
| Tech stack | `<observed stack / package manager / framework>` | `<how the implementation agent should work with it>` |
| Relevant files | `<paths>` | `<why they matter>` |
| Existing patterns | `<paths or examples>` | `<pattern to follow>` |
| Existing tests | `<paths or commands>` | `<how tests should be extended>` |
| Commands | `<commands found in package scripts, Makefile, README, etc.>` | `<when the implementation agent should run them>` |
| Agent/repo guidance | `<AGENTS.md/README/etc.>` | `<rules the implementation agent must follow>` |

Only include evidence you actually observed. If something is inferred, label it `Assumption`.

## 4. Design decision

Describe the recommended implementation approach.

Keep this concise:

- Chosen approach.
- Why this approach fits the existing repo.
- Alternatives considered and rejected, only if relevant.
- Risks or trade-offs.

Do not provide a long architecture essay.

## 5. Implementation milestones

Break the work into small milestones that an implementation agent can implement sequentially.

For each milestone, use this exact format:

### Milestone M[N]: [name]

**Goal:**  
One clear outcome.

**Files likely to change:**  
- `path/to/file`
- `path/to/other-file`

**Files to inspect first:**  
- `path/to/reference-file`
- `path/to/test-or-example`

**Implementation steps:**  
1. Concrete step.
2. Concrete step.
3. Concrete step.

**Tests/checks for this milestone:**  
- Add/update: `path/to/test`
- Run: `exact command`
- Expected result: `specific expected result`

**Acceptance criteria:**  
- [ ] Observable criterion.
- [ ] Observable criterion.
- [ ] Relevant tests pass.

**Rollback/safety note:**  
Explain how to keep the change isolated or reversible.

Rules for milestones:

- Each milestone should be independently reviewable.
- Each milestone should have a clear test or verification path.
- Avoid milestones that say only “update code” or “clean up.”
- Avoid mixing unrelated concerns in the same milestone.
- Prefer modifying existing files and patterns over creating new abstractions.

## 6. Data, API, and interface contracts

Include this section only if relevant.

Document any expected contracts the implementation agent must preserve or introduce.

Use whichever subsections apply:

### Inputs

- Name:
- Type:
- Source:
- Validation boundary:

### Outputs

- Name:
- Type:
- Consumer:
- Compatibility expectation:

### API behavior

| Case | Request/input | Expected behavior | Error behavior |
|---|---|---|---|

### State/storage changes

| Object/table/file | Change | Migration needed? | Compatibility concern |
|---|---|---|---|

If no contracts are relevant, write:

`No explicit data, API, or interface contract changes are required.`

## 7. Test and verification plan

Provide the exact verification sequence the implementation agent should run.

Use this format:

### Required checks

1. `command`
   - Purpose:
   - Expected result:

2. `command`
   - Purpose:
   - Expected result:

### Targeted tests

- `command or test file`
  - Covers:

### Manual verification

Include only if automated verification is insufficient.

- Step:
- Expected observation:

### Verification fallback

If a command is unavailable, too slow, missing dependencies, or fails because of environment setup, the implementation agent should:

1. Report the exact command and failure.
2. Run the nearest narrower check if available.
3. Explain what remains unverified.
4. Avoid claiming success for unverified behavior.

## 8. Implementation agent execution instructions

This is the exact instruction block the user can paste into an implementation agent.

~~~text
Implement the work described in PLAN.md.

Follow the milestones in order. Before editing, inspect the files listed in each milestone and confirm the plan still matches the repository. If the repo has changed, adapt minimally and explain the deviation.

Constraints:
- Make the smallest correct change.
- Follow existing repo conventions.
- Do not perform unrelated cleanup or refactoring.
- Do not introduce new dependencies unless PLAN.md explicitly requires them.
- Do not change public APIs, schemas, routes, or behavior outside the stated scope.
- Add or update tests where PLAN.md specifies them.
- Run the verification commands listed in PLAN.md.
- If a verification command fails, diagnose whether it is caused by your changes or by pre-existing/environment issues.
- Do not mark the task complete unless the acceptance criteria are met or clearly state what remains unverified.

At the end, provide:
1. Summary of changes.
2. Files changed.
3. Tests/checks run and results.
4. Any deviations from PLAN.md.
5. Remaining risks or follow-ups, if any.
~~~

## 9. Acceptance criteria

Create a final checklist that an implementation agent can use before stopping.

- [ ] Requested outcome is implemented.
- [ ] All in-scope behavior is covered.
- [ ] Out-of-scope behavior was not changed.
- [ ] Relevant tests were added or updated.
- [ ] Required verification commands were run.
- [ ] Failing checks, if any, are explained with evidence.
- [ ] No unrelated refactoring or dependency changes were introduced.
- [ ] Final behavior matches the user request.

## 10. Open questions and assumptions

Separate true blockers from non-blocking assumptions.

### Blocking questions

Only include questions that must be answered before the implementation agent can safely implement.

- None, unless genuinely blocking.

### Non-blocking assumptions

List assumptions the implementation agent may proceed with, provided it verifies them while inspecting the repo.

- Assumption:
  - Evidence:
  - How the implementation agent should verify:

## 11. Risk register

Use this table:

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| `<risk>` | Low/Medium/High | Low/Medium/High | `<specific mitigation>` |

Only include practical implementation risks.

## 12. Final instruction to an implementation agent

The implementation agent should proceed milestone by milestone, validating after each meaningful change. If the plan conflicts with actual repository evidence, the implementation agent should trust the repository, make the smallest reasonable adaptation, and report the deviation in its final summary.

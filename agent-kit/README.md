# Portable agent kit

Use this kit in the source repository whose screens and features you review. It does not replace that repository's existing instructions.

1. Merge [AGENTS.template.md](AGENTS.template.md) into your root AGENTS.md, retaining established project constraints.
2. Point tool-specific instruction files to that single source using [adapters](adapters/).
3. Configure [MCP](clients/README.md), or use the [CLI/context workflow](../docs/agents/README.md).
4. Copy selected skill folders into the directory your agent supports, or paste their steps into a task. File discovery differs by agent; no universal automatic installer is claimed.
5. Keep credentials in environment/secret storage. Use separate expiring project tokens for different agents.

Recipes: [review feedback](skills/review-feedback/SKILL.md), [review assets](skills/review-assets/SKILL.md), [plan sprint](skills/plan-sprint/SKILL.md), [update docs](skills/update-docs/SKILL.md), [verify change](skills/verify-change/SKILL.md), [release review](skills/release-review/SKILL.md).

A practical request: “Read AgentStack project <UUID>, inspect the open notes for the recovery flow, fix the requested screens in this repository and submit evidence for my acceptance. Keep unrelated work intact.”

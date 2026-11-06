# Public repository governance

Repository settings are configured through GitHub; committing this document does not apply them. Maintainers should audit the [active rules](https://github.com/builtx-pro/agentstack/rules) after changing access, workflow names or CI providers.

## Main branch

Two independent active rulesets target `refs/heads/main`:

1. **Main integrity** has no bypass actors. Changes must use a PR; the `verify` check from the GitHub Actions integration must pass with the branch up to date; review conversations must be resolved. Branch deletion and non-fast-forward updates are forbidden.
2. **Maintainer review** requires one code-owner approval and dismisses stale approvals after a new reviewable push. Organization owners may bypass this review rule only through a PR. This supports the sole-maintainer case without letting the owner skip the separate PR/CI requirements. A bypass is not an independent review.

`CODEOWNERS` names the current maintainer with repository write access. Update it as maintainers join. Do not introduce permanent CI/PR bypasses for coding agents. Repository settings remain editable by administrators; rulesets protect ordinary Git operations, not against an administrator deliberately changing governance itself.

Squash and merge commits are available; rebase merging is disabled. Merged source branches are deleted automatically. `main` remains protected. A release should identify the exact tested application commit and include verification/migration notes; GitHub's generated changelog is only a starting point.

## External contributions and automation

Fork PR workflows require approval for all external contributors. Inspect changed workflows, dependencies and scripts before approving execution. Use hosted runners for untrusted fork code; do not connect them to production or self-hosted runners containing secrets. The current CI uses `pull_request`, a read-only token, and no deployment secrets. Do not switch to `pull_request_target` to execute untrusted PR code.

GitHub Actions require full-length SHA pins. Workflow tokens cannot approve PRs. Dependabot opens weekly npm/GitHub Actions updates; security updates are enabled, but merges are not automatic. Secret scanning, push protection and private vulnerability reporting are enabled. These controls complement review and do not prove the absence of vulnerabilities or leaked credentials.

## Community routes

- Issues: bug reports, feature proposals and documentation corrections through templates.
- Discussions: questions and early ideas.
- Private security reporting: vulnerabilities and sensitive reproductions.
- Contribution and support guides: [CONTRIBUTING](../../CONTRIBUTING.md), [SUPPORT](../../SUPPORT.md), [SECURITY](../../SECURITY.md), [conduct](../../CODE_OF_CONDUCT.md).

Do not attach customer data to any public route. Do not claim a response-time SLA or create fake activity to make the repository look established.

# Security policy

AgentStack is currently under active development. No production release is declared supported until a tagged release includes its verification report.

Please report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/builtx-pro/agentstack/security/advisories/new). Include a minimal synthetic reproduction and affected revision. Do not attach live credentials, private databases or customer material.

Important boundaries: project isolation across every API adapter, protected files and historical revisions, agent-token scopes, human acceptance, safe preview rendering and untrusted import paths. A hidden UI button is never an authorization control.

Use HTTPS for remote installations, keep PostgreSQL private, rotate compromised credentials, and retain tested encrypted backups. See the installation and backup runbooks.

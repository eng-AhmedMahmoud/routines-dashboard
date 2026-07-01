# Security policy

## Reporting a vulnerability

If you find a security issue, please [open a private security advisory](../../security/advisories/new) on GitHub with:

- A description of the issue
- Steps to reproduce
- The impact (what an attacker could do)
- Any suggested fix

Maintainers will acknowledge within 72 hours and aim to ship a patch within 7 days for high-severity issues.

**Please do not** open a public GitHub issue for security reports.

## Scope

In scope:
- Token exfiltration (Keychain OAuth token, anything sensitive leaving the local machine)
- Arbitrary file write / RCE via crafted plist
- Command injection in `launchctl` / `plutil` invocations
- CSRF on the local API surface

Out of scope (these are accepted properties of a local-first tool):
- Anyone with shell access to the user's machine can read the metadata file
- The dev server binds to localhost by default; binding it to a public interface is the operator's responsibility
- The dashboard trusts the local Claude Code installation

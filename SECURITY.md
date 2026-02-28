# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Currently supported versions:

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of codesession-cli seriously. If you have discovered a security vulnerability, we appreciate your help in disclosing it to us responsibly.

**Please do not report security vulnerabilities through public GitHub issues.**

### How to Report a Security Vulnerability

1. **Email**: Send details to **brianinesh@gmail.com**
2. **Subject Line**: Include "SECURITY" and a brief description
3. **Include**:
   - Type of vulnerability
   - Full paths of source file(s) related to the vulnerability
   - Location of the affected source code (tag/branch/commit or direct URL)
   - Step-by-step instructions to reproduce the issue
   - Proof-of-concept or exploit code (if possible)
   - Impact of the issue, including how an attacker might exploit it

### What to Expect

* **Acknowledgment**: We'll acknowledge receipt of your vulnerability report within 48 hours
* **Communication**: We'll keep you informed about the progress of fixing the vulnerability
* **Credit**: We'll give you credit for the discovery in the release notes (unless you prefer to remain anonymous)
* **Fix Timeline**: We aim to release a patch within 30 days for critical vulnerabilities

## Security Best Practices for Users

### API Keys and Tokens

* Never commit API keys or tokens to version control
* Store sensitive credentials in environment variables
* Use `.gitignore` to exclude configuration files with credentials
* Rotate API keys regularly

### Database Security

* The SQLite database (`codesession.db`) may contain project metadata
* Do not share your database file publicly
* Exclude `*.db` files from version control

### Dependencies

* Keep codesession-cli updated to the latest version
* Run `npm audit` regularly to check for vulnerable dependencies
* Use `npm audit fix` to automatically update vulnerable packages when possible

### Privacy Considerations

* codesession-cli tracks file changes and git commits locally
* No data is sent to external servers by default
* Review tracked data before sharing session reports

## Security Features

### Local-First Architecture

* All tracking data is stored locally in SQLite
* No telemetry or external data transmission
* Full control over your project metrics

### Safe File Operations

* Read-only file system monitoring
* No modification of tracked files
* Respects `.gitignore` patterns

## Vulnerability Disclosure Policy

* We follow a coordinated disclosure process
* Security patches will be released as soon as safely possible
* Critical vulnerabilities will be prioritized
* Public disclosure timing will be coordinated with the reporter

## Known Security Considerations

### File System Access

codesession-cli requires file system access to:
* Read project files for tracking changes
* Monitor git repository status
* Write session data to SQLite database

These operations are performed with standard user permissions.

### Command Execution

The CLI executes git commands to track repository state. Ensure your git installation is from a trusted source.

## Security Updates

Subscribe to security updates by:
* Watching this repository on GitHub
* Following releases and security advisories
* Checking the [CHANGELOG](CHANGELOG.md) regularly

## Compliance

codesession-cli is an MIT-licensed open-source tool for local development tracking. Users are responsible for ensuring their use complies with their organization's security policies.

## Contact

For security inquiries: brianinesh@gmail.com

For general support: [GitHub Issues](https://github.com/brian-mwirigi/codesession-cli/issues)

---

Thank you for helping keep codesession-cli and its users safe!

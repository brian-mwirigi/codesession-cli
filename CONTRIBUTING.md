# Contributing to codesession-cli

Thank you for your interest in contributing to codesession-cli! We welcome contributions from the community.

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include as many details as possible:

* **Use a clear and descriptive title**
* **Describe the exact steps to reproduce the problem**
* **Provide specific examples** - include command outputs, screenshots, or code snippets
* **Describe the behavior you observed** and what you expected to see
* **Include your environment details**: OS, Node.js version, npm version, codesession-cli version

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

* **Use a clear and descriptive title**
* **Provide a detailed description** of the suggested enhancement
* **Include examples** of how the enhancement would be used
* **Explain why this enhancement would be useful** to most users

### Pull Requests

* Fill in the required pull request template
* Follow the coding style used throughout the project
* Include tests when adding new features
* Update documentation for any changed functionality
* End all files with a newline

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR-USERNAME/codesession-cli.git
   cd codesession-cli
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run in development mode**
   ```bash
   npm run dev
   ```

5. **Build the dashboard**
   ```bash
   npm run build:dashboard
   ```

## Project Structure

```
codesession-cli/
├── src/              # Core CLI source code
│   ├── index.ts      # Main CLI entry point
│   ├── db.ts         # Database operations
│   ├── watcher.ts    # File watcher
│   ├── agents.ts     # Agent tracking
│   └── mcp-server.ts # MCP server implementation
├── dashboard/        # Web dashboard
│   └── src/
│       ├── App.tsx   # Main dashboard component
│       └── components/ # Dashboard UI components
├── scripts/          # Build and utility scripts
└── docs/            # Documentation
```

## Coding Guidelines

### TypeScript

* Use TypeScript for all new code
* Maintain type safety - avoid `any` when possible
* Use interfaces for object shapes
* Export types that may be used by consumers

### Code Style

* Use 2 spaces for indentation
* Use meaningful variable and function names
* Add comments for complex logic
* Keep functions small and focused

### Commits

* Use clear and meaningful commit messages
* Follow conventional commits format when possible:
  * `feat:` - New features
  * `fix:` - Bug fixes
  * `docs:` - Documentation changes
  * `refactor:` - Code refactoring
  * `test:` - Adding or updating tests
  * `chore:` - Maintenance tasks

Example: `feat: add support for new AI agent pricing`

## Testing

Run tests before submitting a pull request:

```bash
npm test
```

If you're adding new functionality, please include appropriate tests.

## Documentation

* Update the README.md if you change functionality
* Add JSDoc comments for public APIs
* Update CHANGELOG.md with your changes

## Release Process

Releases are handled by project maintainers. The process includes:

1. Version bump in package.json
2. Update CHANGELOG.md
3. Create GitHub release
4. Publish to npm

## Getting Help

* Check the [README](README.md) for basic usage
* Review existing [Issues](https://github.com/brian-mwirigi/codesession-cli/issues)
* Join discussions in [GitHub Discussions](https://github.com/brian-mwirigi/codesession-cli/discussions)

## Recognition

Contributors will be recognized in:
* GitHub contributors page
* CHANGELOG.md for significant contributions
* Project documentation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Don't hesitate to ask questions by opening an issue with the "question" label.

Thank you for contributing! 🎉

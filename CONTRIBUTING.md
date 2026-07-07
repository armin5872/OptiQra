# Contributing to Site Vitals

Thank you for your interest in contributing to Site Vitals! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Focus on the code, not the person
- Help others learn and grow
- Report abusive behavior to maintainers

## Getting Started

### Prerequisites
- Node.js 18+
- Git
- npm or yarn

### Development Setup

```bash
# Fork the repository
# Clone your fork
git clone https://github.com/yourusername/site-vitals-next.git
cd site-vitals-next

# Add upstream remote
git remote add upstream https://github.com/original-owner/site-vitals-next.git

# Install dependencies
npm install

# Create a feature branch
git checkout -b feature/your-feature-name
```

### Running Locally

```bash
# Development server
npm run dev

# Linting
npm run lint

# Production build
npm run build
npm start

# With Docker
docker-compose -f docker-compose.dev.yml up --build
```

## Contribution Types

### Bug Reports

Report bugs by opening an issue with:
- Clear, descriptive title
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, etc.)
- Screenshots or error logs if applicable

### Feature Requests

Suggest features by opening an issue with:
- Clear description of the feature
- Use cases and benefits
- Potential implementation approach
- Any relevant examples or mockups

### Code Contributions

#### Process

1. **Create a feature branch** from `main`
   ```bash
   git checkout -b feature/audit-enhancement
   ```

2. **Make your changes**
   - Follow code style (see below)
   - Add tests for new functionality
   - Update documentation as needed

3. **Test thoroughly**
   ```bash
   npm run lint      # Check code quality
   npm run build     # Test build
   npm run dev       # Manual testing
   ```

4. **Commit with clear messages**
   ```bash
   git commit -m "Add feature: X"
   ```

5. **Push and create a Pull Request**
   ```bash
   git push origin feature/audit-enhancement
   ```

6. **Respond to review feedback**

### Code Style

#### TypeScript
- Use strict mode (`"strict": true` in tsconfig.json)
- Use explicit type annotations for function parameters and returns
- Avoid `any` type; use `unknown` or specific types instead

#### Function naming
- Use descriptive names: `analyzeSecurityHeaders()` not `check()`
- Use verbs for functions: `get`, `fetch`, `analyze`, `validate`, `calculate`
- Use nouns for interfaces/types

#### Code formatting
- 2-space indentation
- Semicolons at end of statements
- Single quotes for strings
- Max line length: 100 characters (soft limit)

#### Comments
```typescript
// Good: Explains why, not what
// Fetch headers with bot User-Agent to avoid being blocked
const headers = await fetch(url, { headers: { 'User-Agent': 'SiteVitalsBot/1.0' } });

// Avoid: States the obvious
// Get the URL
const url = params.url;
```

### File Organization

- **`lib/`** - Core audit logic
  - `auditUtils.ts` - Shared utilities
  - `*Audit.ts` - Specific audit types
  
- **`app/`** - Next.js app directory
  - `api/` - API routes
  - `page.tsx` - UI components

### Adding New Audits

1. Create a new file: `src/lib/[name]Audit.ts`
2. Implement the analysis function
3. Follow the existing pattern:
   ```typescript
   import { issue, pass, type Issue } from '@/lib/auditUtils';
   
   export async function analyzeFeature() {
     const issues: Issue[] = [];
     const passed: Issue[] = [];
     
     // Analysis logic
     
     return { issues, passed };
   }
   ```
4. Add to API route: `src/app/api/analyze/route.ts`
5. Update UI to display results
6. Add tests and documentation

### Adding Security Headers

1. Add header to `securityHeadersAudit.ts`:
   ```typescript
   const SECURITY_HEADERS = {
     'Header-Name': {
       weight: 10,
       description: 'What this does',
       recommendation: 'How to implement',
     },
   };
   ```

2. Add validation logic
3. Document in README.md

### Documentation

Update docs when making changes:
- **Code comments** - For complex logic
- **README.md** - For features visible to users
- **DEPLOYMENT.md** - For deployment changes
- **Inline JSDoc** - For public functions

## Pull Request Process

### Before Submitting

1. **Sync with upstream**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run full test suite**
   ```bash
   npm run lint
   npm run build
   ```

3. **Test manually** - Verify the feature works as intended

### PR Description

Include:
- Clear title: `feat: Add X feature` or `fix: Resolve Y issue`
- Description of changes
- Related issue (if applicable): `Fixes #123`
- Screenshots/GIFs for UI changes
- Testing steps

### PR Template

```markdown
## Description
Brief explanation of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement

## Testing
- [ ] Tested locally
- [ ] Verified build passes
- [ ] Linting passes

## Related Issues
Fixes #

## Screenshots (if applicable)
<!-- Add screenshots here -->
```

### Review Process

- Maintainers will review your PR
- Respond to feedback constructively
- Make requested changes in new commits
- Push updates to same branch

## Development Tips

### Debugging

```bash
# Add debug logs
console.log('Debug:', variable);

# Use debugger in VS Code
// Set breakpoint and run:
node --inspect-brk ./node_modules/.bin/next dev
```

### Common Tasks

#### Add new security header check
1. Edit `src/lib/securityHeadersAudit.ts`
2. Add to `SECURITY_HEADERS` object
3. Implement validation logic
4. Update README with explanation

#### Improve existing audit
1. Edit relevant `*Audit.ts` file
2. Enhance detection logic
3. Update scoring algorithm if needed
4. Add test cases

#### Update UI
1. Edit `src/app/page.tsx` or `globals.css`
2. Test responsive design
3. Verify accessibility

## Commit Message Guidelines

Use conventional commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:** feat, fix, docs, style, refactor, perf, test, chore

**Examples:**
```
feat(security): Add X-Custom-Header validation
fix(api): Resolve timeout issue with large pages
docs: Update security headers section
```

## Running Tests

```bash
# Run linter
npm run lint

# Fix linting issues automatically
npm run lint -- --fix

# Build test
npm run build

# Local dev test
npm run dev
# Then test manually at http://localhost:3000
```

## Performance Guidelines

When adding new features:
- Avoid blocking operations in the UI thread
- Cache fetch results appropriately
- Optimize regex patterns for HTML parsing
- Test with large websites (100+ MB)

## Security Considerations

- Validate all user inputs (URLs)
- Never log sensitive information
- Sanitize error messages before displaying
- Use HTTPS for external requests
- Follow OWASP guidelines

## Questions?

- Open an issue with the `question` label
- Join discussions in existing issues
- Check existing documentation

## Recognition

Contributors will be recognized in:
- Commit history
- Pull request credits
- Contributors list (future)

Thank you for making Site Vitals better! 🚀

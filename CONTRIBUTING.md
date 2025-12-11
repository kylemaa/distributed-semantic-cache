# Contributing to Distributed Semantic Cache POC

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Git

### Clone and Install

```bash
git clone <repository-url>
cd distributed-semantic-cache-poc
pnpm install
```

## Project Structure

```
distributed-semantic-cache-poc/
├── packages/
│   ├── shared/          # Shared utilities and types
│   │   ├── src/
│   │   │   ├── types.ts       # TypeScript interfaces
│   │   │   ├── similarity.ts   # Cosine similarity functions
│   │   │   └── index.ts        # Package exports
│   │   └── package.json
│   │
│   ├── api/             # Backend API server
│   │   ├── src/
│   │   │   ├── index.ts        # Server entry point
│   │   │   ├── config.ts       # Configuration
│   │   │   ├── database.ts     # SQLite operations
│   │   │   ├── embeddings.ts   # OpenAI embeddings
│   │   │   ├── cache-service.ts # Cache logic
│   │   │   └── routes.ts       # API routes
│   │   └── package.json
│   │
│   └── web/             # Frontend React app
│       ├── src/
│       │   ├── App.tsx         # Main component
│       │   ├── App.css         # Styles
│       │   ├── main.tsx        # Entry point
│       │   └── index.css       # Global styles
│       └── package.json
│
├── README.md
├── QUICKSTART.md
├── EXAMPLES.md
├── CONTRIBUTING.md
└── package.json
```

## Development Workflow

### Running in Development Mode

Start all packages:
```bash
pnpm dev
```

Or run individual packages:
```bash
# API only
cd packages/api && pnpm dev

# Web only
cd packages/web && pnpm dev

# Shared (watch mode)
cd packages/shared && pnpm dev
```

### Building

Build all packages:
```bash
pnpm build
```

Build individual packages:
```bash
cd packages/api && pnpm build
```

### Type Checking

Type-check all packages:
```bash
pnpm type-check
```

## Code Style

### TypeScript Guidelines

- Use TypeScript for all new files
- Enable strict mode
- Prefer interfaces over types for object shapes
- Use explicit return types for functions
- Avoid `any` - use `unknown` if necessary

### Naming Conventions

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Interfaces: `PascalCase` (no `I` prefix)

### Code Organization

- One class/component per file
- Export from index files
- Keep files under 300 lines
- Group related functions

## Adding New Features

### Adding a New API Endpoint

1. Add types to `packages/shared/src/types.ts`
2. Implement logic in appropriate service file
3. Add route in `packages/api/src/routes.ts`
4. Update API documentation in README

Example:
```typescript
// 1. Add type in shared/src/types.ts
export interface SearchRequest {
  query: string;
  limit: number;
}

// 2. Add to cache-service.ts
async search(request: SearchRequest): Promise<CacheEntry[]> {
  // Implementation
}

// 3. Add route in routes.ts
app.post('/api/cache/search', async (request, reply) => {
  const result = await cacheService.search(request.body);
  return result;
});
```

### Adding a New Shared Utility

1. Create file in `packages/shared/src/`
2. Export from `packages/shared/src/index.ts`
3. Add tests if applicable
4. Document in README

Example:
```typescript
// packages/shared/src/distance.ts
export function euclideanDistance(a: number[], b: number[]): number {
  // Implementation
}

// packages/shared/src/index.ts
export * from './distance';
```

### Adding UI Components

1. Create component in `packages/web/src/components/`
2. Import and use in `App.tsx`
3. Add styles in corresponding `.css` file

Example:
```typescript
// packages/web/src/components/CacheStats.tsx
export function CacheStats({ count }: { count: number }) {
  return <div>Cache Entries: {count}</div>;
}
```

## Testing

Currently, this is a POC without formal tests. If adding tests:

1. Use Jest or Vitest
2. Test files: `*.test.ts` or `*.spec.ts`
3. Aim for >80% coverage on critical paths
4. Mock external dependencies

## Committing Changes

### Commit Message Format

Use conventional commits:

```
type(scope): description

[optional body]
[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting)
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

Examples:
```
feat(api): add bulk insert endpoint
fix(web): resolve cache stats refresh issue
docs: update API documentation
```

### Branch Naming

- `feature/description`
- `fix/description`
- `docs/description`

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Run type-check and build: `pnpm type-check && pnpm build`
4. Update documentation if needed
5. Submit PR with clear description
6. Address review feedback

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested?

## Checklist
- [ ] Code follows project style
- [ ] Type-check passes
- [ ] Build succeeds
- [ ] Documentation updated
```

## Common Tasks

### Adding a New Dependency

```bash
# To a specific package
cd packages/api
pnpm add fastify-plugin

# To workspace root
pnpm add -w eslint
```

### Updating Dependencies

```bash
# Update all
pnpm update

# Update specific package
pnpm update fastify
```

### Cleaning Build Artifacts

```bash
pnpm clean
```

## Environment Variables

When adding new environment variables:

1. Add to `.env.example` with documentation
2. Load in `packages/api/src/config.ts`
3. Document in README

## Performance Considerations

- Batch embeddings generation when possible
- Use database indexes for queries
- Implement pagination for large result sets
- Cache embeddings client-side when appropriate
- Consider connection pooling for production

## Security Considerations

- Never commit `.env` files
- Validate all user inputs
- Sanitize data before storage
- Use parameterized queries
- Rate limit API endpoints
- Implement authentication for production

## Documentation

When adding features, update:

- README.md - main documentation
- QUICKSTART.md - if it affects getting started
- EXAMPLES.md - add usage examples
- API documentation - endpoint details

## Getting Help

- Check existing documentation
- Review example code
- Look at similar implementations
- Open an issue for questions

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

## Code of Conduct

- Be respectful and constructive
- Welcome newcomers
- Focus on the best outcome for the project
- Accept feedback graciously

Thank you for contributing! 🚀

# Security Considerations

This document outlines security considerations and production hardening requirements.

---

## Security Status

| Area | POC Status | Production Requirement |
|------|------------|----------------------|
| Rate Limiting | ❌ None | ✅ Required |
| Authentication | ❌ None | ✅ Required |
| Input Validation | ⚠️ Basic | ✅ Comprehensive |
| SQL Injection | ✅ Protected | ✅ Protected |
| Encryption at Rest | ✅ Available | ✅ Enable strict mode |
| CORS | ⚠️ Permissive | ✅ Restrict origins |
| API Keys | ⚠️ Env vars | ✅ Secret management |

---

## Known Limitations (POC)

### 1. Missing Rate Limiting

**Issue**: API endpoints are not rate-limited.

**Risk**: HIGH
- Resource exhaustion
- Increased API costs (OpenAI embeddings)
- DoS vulnerability

**Production Mitigation**:
```typescript
import rateLimit from '@fastify/rate-limit';

app.register(rateLimit, {
  max: 100,           // Max requests
  timeWindow: '1 minute',
  keyGenerator: (request) => request.headers['x-api-key'] || request.ip,
});
```

---

### 2. No Authentication/Authorization

**Issue**: All endpoints are publicly accessible.

**Risk**: HIGH
- Unauthorized data access
- Cache manipulation
- Resource abuse

**Production Mitigation**:
```typescript
// API Key authentication
app.addHook('onRequest', async (request, reply) => {
  const apiKey = request.headers['x-api-key'];
  
  if (!apiKey || !isValidApiKey(apiKey)) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  
  request.tenantId = getTenantFromApiKey(apiKey);
});

// Or JWT authentication
import jwt from '@fastify/jwt';

app.register(jwt, {
  secret: process.env.JWT_SECRET,
});

app.addHook('onRequest', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});
```

---

### 3. Input Validation

**Issue**: Limited input validation on API endpoints.

**Risk**: MEDIUM
- Invalid data in database
- Application crashes
- Unexpected behavior

**Production Mitigation**:
```typescript
// JSON Schema validation
const storeSchema = {
  body: {
    type: 'object',
    required: ['query', 'response'],
    properties: {
      query: { 
        type: 'string', 
        minLength: 1,
        maxLength: 2000,
      },
      response: { 
        type: 'string', 
        minLength: 1,
        maxLength: 50000,
      },
      metadata: {
        type: 'object',
        additionalProperties: true,
      },
    },
    additionalProperties: false,
  },
};

app.post('/api/cache/store', { schema: storeSchema }, handler);
```

---

### 4. CORS Configuration

**Issue**: CORS allows broad origins in development.

**Risk**: MEDIUM
- Cross-origin attacks
- Unauthorized access from untrusted domains

**Production Mitigation**:
```typescript
app.register(cors, {
  origin: [
    'https://app.yourcompany.com',
    'https://admin.yourcompany.com',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
});
```

---

### 5. API Key Management

**Issue**: OpenAI API key stored in environment variables.

**Risk**: HIGH
- Unauthorized API usage
- Financial exposure
- Account compromise

**Production Mitigation**:
- Use secret management (AWS Secrets Manager, HashiCorp Vault)
- Rotate keys regularly
- Set spending limits on API keys
- Never commit `.env` files
- Use separate keys for dev/staging/prod

```typescript
// AWS Secrets Manager example
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManager({ region: 'us-east-1' });

async function getOpenAIKey() {
  const response = await client.getSecretValue({
    SecretId: 'prod/openai/api-key',
  });
  return JSON.parse(response.SecretString!).apiKey;
}
```

---

## Protected Areas

### SQL Injection ✅

The application uses parameterized queries via `better-sqlite3`:

```typescript
// Safe - uses prepared statements
this.db.prepare('INSERT INTO cache_entries (id, query) VALUES (?, ?)').run(id, query);

// Never concatenate user input
// ❌ WRONG: `SELECT * FROM cache WHERE query = '${userInput}'`
```

---

### Encryption at Rest ✅

Enable strict privacy mode for AES-256-GCM encryption:

```env
PRIVACY_MODE=strict
ENCRYPTION_KEY=YourSecure32CharacterKeyHere!@#$
```

**Features:**
- PBKDF2 key derivation (100,000 iterations)
- Random IV per encryption
- GCM authentication tags
- Password strength validation

---

## Production Hardening Checklist

### Authentication & Authorization
- [ ] Implement API key or JWT authentication
- [ ] Add role-based access control (RBAC)
- [ ] Validate tenant isolation in multi-tenant mode
- [ ] Implement session management

### Rate Limiting & DoS Protection
- [ ] Add rate limiting per API key/IP
- [ ] Implement request size limits
- [ ] Add timeout handling
- [ ] Consider WAF (Web Application Firewall)

### Input Validation
- [ ] Add JSON schema validation to all endpoints
- [ ] Sanitize all user inputs
- [ ] Validate query length limits
- [ ] Validate metadata structure

### Encryption & Secrets
- [ ] Enable `PRIVACY_MODE=strict` for sensitive data
- [ ] Use secret management service
- [ ] Implement key rotation
- [ ] Enable TLS/HTTPS

### Monitoring & Logging
- [ ] Enable audit logging
- [ ] Set up alerting for anomalies
- [ ] Implement request tracing
- [ ] Monitor rate limit violations

### Infrastructure
- [ ] Use HTTPS only
- [ ] Configure restrictive CORS
- [ ] Set security headers (CSP, HSTS)
- [ ] Regular security updates

---

## Compliance Considerations

### HIPAA (Healthcare)

| Requirement | Implementation |
|-------------|----------------|
| Encryption at rest | ✅ `PRIVACY_MODE=strict` |
| Access controls | ⚠️ Add authentication |
| Audit trails | ✅ `AUDIT_ENABLED=true` |
| Data minimization | ✅ Query hashing in strict mode |
| Transmission security | ⚠️ Add HTTPS |
| BAA with vendors | ⚠️ Use local embeddings or get OpenAI BAA |

### GDPR (European Privacy)

| Requirement | Implementation |
|-------------|----------------|
| Right to erasure | ✅ Delete API available |
| Data minimization | ✅ Hash-only audit logs |
| Purpose limitation | ✅ Configurable features |
| Storage limitation | ✅ `AUDIT_RETENTION_DAYS` |
| Encryption | ✅ AES-256-GCM |
| Data processing agreements | ⚠️ Required for OpenAI |

### SOC 2 Type II

| Control | Implementation |
|---------|----------------|
| CC6.1 Logical access | ⚠️ Add authentication |
| CC6.6 Boundary protection | ⚠️ Add rate limiting |
| CC6.7 Transmission | ⚠️ Add HTTPS |
| CC7.2 Monitoring | ✅ Audit logs |
| CC8.1 Change management | ⚠️ Add CI/CD controls |

---

## Security Headers (Production)

```typescript
app.addHook('onSend', async (request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  reply.header('Content-Security-Policy', "default-src 'self'");
});
```

---

## Reporting Security Issues

If you discover a security vulnerability, please:

1. **Do NOT** open a public GitHub issue
2. Email security@yourcompany.com with details
3. Include steps to reproduce
4. Allow 90 days for remediation before disclosure

---

*Last Updated: December 2025*

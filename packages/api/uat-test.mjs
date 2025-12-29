// UAT Test Script - runs comprehensive API tests
const BASE_URL = 'http://127.0.0.1:3000';

async function runTests() {
  console.log('🧪 Semantic Cache API - UAT Tests\n');
  let passed = 0, failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (e) {
      console.log(`❌ ${name}: ${e.message}`);
      failed++;
    }
  }

  // Test 1: Health Check
  await test('Health Check', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error('Invalid response');
  });

  // Test 2: API Info
  await test('API Info', async () => {
    const res = await fetch(`${BASE_URL}/`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.version) throw new Error('Missing version');
  });

  // Test 3: Stats Endpoint
  await test('Cache Stats', async () => {
    const res = await fetch(`${BASE_URL}/api/cache/stats`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  });

  // Test 4: Store Entry
  const testQuery = `What is the capital of France? (test-${Date.now()})`;
  const testResponse = 'The capital of France is Paris.';
  await test('Store Entry', async () => {
    const res = await fetch(`${BASE_URL}/api/cache/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: testQuery, response: testResponse })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error('Store failed');
    console.log(`   Stored: "${testQuery.substring(0, 40)}..."`);
  });

  // Test 5: Query - Exact Match
  await test('Query - Exact Match', async () => {
    const res = await fetch(`${BASE_URL}/api/cache/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: testQuery })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.hit) throw new Error('Expected cache hit');
    if (data.response !== testResponse) throw new Error('Response mismatch');
    console.log(`   Match type: ${data.matchType}, Similarity: ${data.similarity}`);
  });

  // Test 6: Query - Semantic Match
  await test('Query - Semantic Match', async () => {
    const res = await fetch(`${BASE_URL}/api/cache/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Tell me the capital city of France', threshold: 0.7 })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    console.log(`   Hit: ${data.hit}, Similarity: ${data.similarity?.toFixed(4) || 'N/A'}, Type: ${data.matchType || 'miss'}`);
  });

  // Test 7: Query - Miss (should not find)
  await test('Query - Cache Miss (different topic)', async () => {
    const res = await fetch(`${BASE_URL}/api/cache/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'How do I cook spaghetti carbonara?', threshold: 0.95 })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.hit) throw new Error('Should be a cache miss');
    console.log(`   Correctly returned cache miss`);
  });

  // Test 8: Validation - Missing Query
  await test('Validation - Missing Query (400)', async () => {
    const res = await fetch(`${BASE_URL}/api/cache/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 9: Validation - Missing Response in Store
  await test('Validation - Missing Response (400)', async () => {
    const res = await fetch(`${BASE_URL}/api/cache/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' })
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 10: Chat endpoint
  await test('Chat Endpoint', async () => {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello, how are you?', response: 'I am fine, thank you!' })
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    console.log(`   Hit: ${data.hit}, Source: ${data.source || 'N/A'}`);
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  console.log(failed === 0 ? '\n✅ All tests passed! Ready for UAT deployment.' : '\n❌ Some tests failed. Please review.');
}

runTests().catch(console.error);

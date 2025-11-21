# End-to-End Tests

This directory contains **optional** end-to-end tests that verify the execution engine works with **real Claude Code processes**.

## Purpose

These tests validate that:
- The execution engine can spawn and manage real Claude Code processes
- All three execution modes work correctly (structured, interactive, hybrid)
- The agent adapter (ClaudeCodeAdapter) correctly configures Claude Code
- All layers work together in a real-world scenario

## Requirements

To run these tests, you need:
1. **Claude Code CLI** installed and available in your PATH
2. **Valid Claude API credentials** configured

## Running E2E Tests

### Default Behavior: Skipped

By default, E2E tests are **skipped** to keep regular test runs fast:

```bash
npm test                    # Skips E2E tests ✓
npm test -- --run           # Skips E2E tests ✓
```

### Enable E2E Tests

To run E2E tests, set the `RUN_E2E_TESTS` environment variable:

```bash
# Run E2E tests only
npm run test:e2e

# Or manually
RUN_E2E_TESTS=true npm test -- --run tests/e2e

# Or run all tests including E2E
RUN_E2E_TESTS=true npm test -- --run
```

### Custom Claude Path

If Claude Code is not in your PATH, specify the path:

```bash
RUN_E2E_TESTS=true CLAUDE_PATH=/path/to/claude npm run test:e2e
```

## What Gets Tested

### Legacy Tests (`claude-execution.test.ts`)

Tests the older ClaudeCodeAdapter with process management layers:

1. **Structured Mode (JSON Output)**
   - Simple task execution with stream-json output
   - Resilience layer integration (retry logic)
   - Multi-step workflow execution

2. **Agent Adapter**
   - Configuration validation
   - Config building
   - Default values

### New Executor Tests (`claude-executor.test.ts`)

Tests the new ClaudeCodeExecutor implementation:

1. **Basic Task Execution**
   - Stream-json output reception
   - Tool execution with approval flow
   - Real bidirectional protocol

2. **Output Normalization**
   - Real Claude output → NormalizedEntry format
   - Message coalescing for streaming responses
   - Tool use parsing

3. **Session Management**
   - Session ID extraction
   - Session resumption with `--resume-session`

4. **Error Handling**
   - Process termination
   - Graceful cleanup

5. **Capabilities**
   - Capability reporting
   - Availability checking

## Test Duration

E2E tests spawn real AI processes, so they are **significantly slower** than unit/integration tests:

- **Unit/Integration tests**: ~50 seconds (748+ tests)
- **Legacy E2E tests** (`claude-execution.test.ts`): ~3-5 minutes (5 tests with real Claude Code)
- **New Executor E2E tests** (`claude-executor.test.ts`): ~5-7 minutes (10 tests with real Claude CLI)

## CI/CD Considerations

For CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      # Regular tests (fast)
      - name: Run unit & integration tests
        run: npm test -- --run

      # E2E tests (slow, requires secrets)
      - name: Run E2E tests
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        env:
          RUN_E2E_TESTS: true
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: npm run test:e2e
```

**Recommendation**: Only run E2E tests on main branch or releases, not on every PR.

## Troubleshooting

### Tests Are Skipped

If you see:
```
Test Files  1 skipped (1)
     Tests   (8)
```

**Solution**: Set `RUN_E2E_TESTS=true`

### Claude Not Found

If you see:
```
[E2E] Claude Code not available at 'claude' - tests will be skipped
```

**Solution**:
1. Install Claude Code CLI
2. Or set `CLAUDE_PATH=/path/to/claude`

### API Errors

If tests fail with API errors:
```
Error: API request failed
```

**Solution**:
1. Check your Claude API credentials
2. Verify you have API quota remaining
3. Check network connectivity

### Timeout Errors

If tests timeout:
```
Error: Test timed out in 120000ms
```

**Cause**: Claude API might be slow or unavailable

**Solution**:
1. Retry the tests
2. Check Anthropic status page
3. Increase timeout in test file (line with `}, 120000)`)

## Example Output

When E2E tests run successfully:

```
 RUN  v3.2.4 /path/to/execution-engine

 ✓ tests/e2e/claude-execution.test.ts (8 tests) 145s
   ✓ E2E: Real Claude Code Execution > Structured Mode (JSON Output) > executes a simple task with Claude Code  45s
   ✓ E2E: Real Claude Code Execution > Structured Mode (JSON Output) > executes task with resilience layer  38s
   ✓ E2E: Real Claude Code Execution > Structured Mode (JSON Output) > executes multi-step workflow  52s
   ✓ E2E: Real Claude Code Execution > Interactive Mode (PTY) > executes task in interactive mode with PTY  43s
   ✓ E2E: Real Claude Code Execution > Hybrid Mode (PTY + JSON) > executes task in hybrid mode  41s
   ✓ E2E: Real Claude Code Execution > Agent Adapter Integration > uses ClaudeCodeAdapter to validate config  1ms
   ✓ E2E: Real Claude Code Execution > Agent Adapter Integration > uses ClaudeCodeAdapter to build valid config  0ms
   ✓ E2E: Real Claude Code Execution > Agent Adapter Integration > gets default config from adapter  0ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  16:20:00
   Duration  145.23s
```

## When to Run E2E Tests

Run E2E tests when:
- ✅ Making changes to process management layer
- ✅ Making changes to agent adapters
- ✅ Before releasing a new version
- ✅ After major refactoring
- ✅ Verifying Claude Code compatibility

Skip E2E tests when:
- ⏭️ Running quick local tests
- ⏭️ Testing non-execution code (types, utils)
- ⏭️ In PRs (let CI handle it)
- ⏭️ When Claude CLI is not available

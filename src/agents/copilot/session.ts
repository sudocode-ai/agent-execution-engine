/**
 * GitHub Copilot Session Management
 *
 * Handles session ID discovery via log file polling.
 * Copilot CLI creates log files named <UUID>.log in the specified directory.
 *
 * @module execution-engine/agents/copilot
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * UUID validation regex
 * Matches standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Default polling configuration
 */
export const SESSION_DISCOVERY_CONFIG = {
  /** Polling interval in milliseconds */
  POLL_INTERVAL_MS: 200,
  /** Timeout in milliseconds (10 minutes) */
  TIMEOUT_MS: 600_000,
} as const;

/**
 * Create a unique temporary log directory for Copilot session logs
 *
 * Directory structure: <tmpdir>/copilot_logs/<workDirName>/<runId>/
 *
 * @param workDir - Working directory path (used for naming)
 * @returns Absolute path to created log directory
 *
 * @example
 * ```typescript
 * const logDir = await createTempLogDir('/path/to/project');
 * // Returns: /tmp/copilot_logs/project/a1b2c3d4-.../
 * ```
 */
export async function createTempLogDir(workDir: string): Promise<string> {
  const baseLogDir = join(tmpdir(), 'copilot_logs');
  await fs.mkdir(baseLogDir, { recursive: true });

  // Extract directory name from workDir path
  const workDirName = workDir.split('/').pop() || 'unknown';

  // Create unique run directory using timestamp + random
  const runId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const runLogDir = join(baseLogDir, workDirName, runId);

  await fs.mkdir(runLogDir, { recursive: true });

  return runLogDir;
}

/**
 * Validate if a string is a valid UUID format
 *
 * @param str - String to validate
 * @returns True if string matches UUID format
 *
 * @example
 * ```typescript
 * isValidUUID('550e8400-e29b-41d4-a716-446655440000'); // true
 * isValidUUID('not-a-uuid'); // false
 * ```
 */
export function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

/**
 * Watch log directory for session ID file creation
 *
 * Polls the directory every 200ms looking for a .log file with a UUID filename.
 * Times out after 10 minutes if no session file is found.
 *
 * **How it works**:
 * 1. Read directory contents
 * 2. Look for files ending in .log
 * 3. Extract filename without extension
 * 4. Validate it's a UUID
 * 5. Return the UUID as session ID
 *
 * @param logDir - Directory to watch for session log files
 * @param options - Optional polling configuration
 * @returns Promise that resolves with session ID
 * @throws Error if no session file found within timeout
 *
 * @example
 * ```typescript
 * const logDir = await createTempLogDir('/path/to/project');
 *
 * // Start watching (this will poll until file appears)
 * const sessionId = await watchSessionId(logDir);
 * console.log('Session ID:', sessionId);
 * ```
 */
export async function watchSessionId(
  logDir: string,
  options: {
    pollIntervalMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<string> {
  const pollInterval = options.pollIntervalMs ?? SESSION_DISCOVERY_CONFIG.POLL_INTERVAL_MS;
  const timeout = options.timeoutMs ?? SESSION_DISCOVERY_CONFIG.TIMEOUT_MS;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const entries = await fs.readdir(logDir);

      for (const entry of entries) {
        if (entry.endsWith('.log')) {
          // Extract session ID from filename
          // Copilot creates files like: session-<UUID>.log
          const extracted = extractSessionId(entry);
          if (extracted) {
            return extracted;
          }
        }
      }
    } catch (err) {
      // Directory might not exist yet or is inaccessible, continue polling
      // This is expected during initial polling before Copilot creates the directory
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `No session log file found in ${logDir} after ${timeout}ms. ` +
    `Copilot may not be running or failed to create session log.`
  );
}

/**
 * Extract session ID from Copilot log filename
 *
 * Helper function to extract and validate session ID from a log filename.
 * Handles both formats:
 * - `<UUID>.log` (older format)
 * - `session-<UUID>.log` (current format)
 *
 * @param filename - Log filename (e.g., "session-550e8400-e29b-41d4-a716-446655440000.log")
 * @returns Session ID if valid, null otherwise
 *
 * @example
 * ```typescript
 * extractSessionId('session-550e8400-e29b-41d4-a716-446655440000.log');
 * // Returns: '550e8400-e29b-41d4-a716-446655440000'
 *
 * extractSessionId('550e8400-e29b-41d4-a716-446655440000.log');
 * // Returns: '550e8400-e29b-41d4-a716-446655440000'
 *
 * extractSessionId('invalid.log');
 * // Returns: null
 * ```
 */
export function extractSessionId(filename: string): string | null {
  if (!filename.endsWith('.log')) {
    return null;
  }

  // Remove .log extension
  let name = filename.replace('.log', '');

  // Remove 'session-' prefix if present
  if (name.startsWith('session-')) {
    name = name.substring('session-'.length);
  }

  // Validate UUID format
  return isValidUUID(name) ? name : null;
}

/**
 * Format session ID for stdout injection
 *
 * Creates the special marker line that gets injected into stdout
 * for downstream processing.
 *
 * @param sessionId - Session UUID
 * @returns Formatted session line with newline
 *
 * @example
 * ```typescript
 * formatSessionLine('550e8400-e29b-41d4-a716-446655440000');
 * // Returns: '[copilot-session] 550e8400-e29b-41d4-a716-446655440000\n'
 * ```
 */
export function formatSessionLine(sessionId: string): string {
  return `[copilot-session] ${sessionId}\n`;
}

/**
 * Parse session ID from stdout line
 *
 * Checks if a line contains a session ID marker and extracts it.
 *
 * @param line - Output line from Copilot
 * @returns Session ID if line contains marker, null otherwise
 *
 * @example
 * ```typescript
 * parseSessionLine('[copilot-session] 550e8400-e29b-41d4-a716-446655440000\n');
 * // Returns: '550e8400-e29b-41d4-a716-446655440000'
 *
 * parseSessionLine('Regular output line');
 * // Returns: null
 * ```
 */
export function parseSessionLine(line: string): string | null {
  const prefix = '[copilot-session] ';
  if (line.startsWith(prefix)) {
    return line.substring(prefix.length).trim();
  }
  return null;
}

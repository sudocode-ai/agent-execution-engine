#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { registerSubmitCommand } from "./commands/submit.js";
import { registerListCommand } from "./commands/list.js";

// Get package.json for version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, "..", "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

// Create CLI program
export const program = new Command();

program
  .name("aee")
  .description(
    "Agent Execution Engine - CLI for interacting with coding agents"
  )
  .version(packageJson.version);

// Register commands
registerSubmitCommand(program);
registerListCommand(program);

// Global error handler
program.configureOutput({
  outputError: (str: string, write: (str: string) => void) => {
    // Color error messages red
    write(`\x1b[31m${str}\x1b[0m`);
  },
});

// Handle unknown commands
program.on("command:*", (operands) => {
  console.error(`\x1b[31mError: Unknown command '${operands[0]}'\x1b[0m`);
  console.error("\nRun 'aee --help' to see available commands.");
  process.exit(1);
});

// Main function to run CLI (only if executed directly)
export function runCli(argv: string[] = process.argv): void {
  // Parse arguments and execute
  program.parse(argv);

  // Show help if no command specified
  if (!argv.slice(2).length) {
    program.outputHelp();
  }
}

// Only run if this module is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}

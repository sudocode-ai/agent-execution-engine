/**
 * Color Scheme and Icons
 *
 * Defines the visual style for rendering different entry types.
 */

import chalk from 'chalk';

/**
 * Color functions for each entry type
 */
export const colors = {
  system: chalk.gray,
  user: chalk.blue,
  assistant: chalk.white,
  thinking: chalk.dim,
  toolUse: chalk.yellow,
  error: chalk.red,
  success: chalk.green,
  info: chalk.cyan,
  dim: chalk.dim,
};

/**
 * Icons for each entry type (no emojis, using ASCII/Unicode symbols)
 */
export const icons = {
  system: '[SYS]',
  user: '[USER]',
  assistant: '[AI]',
  thinking: '[...]',
  toolUse: '[TOOL]',
  error: '[ERR]',
  success: '[OK]',
  info: '[i]',
};

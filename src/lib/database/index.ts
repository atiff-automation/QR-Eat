/**
 * Database Module - Central Prisma Client Export
 *
 * This index file provides a clean re-export of the Prisma client
 * and related database utilities from the parent database.ts file.
 *
 * Modern practice: Using a directory with index.ts for better
 * module organization and future extensibility.
 */

export { prisma, type TransactionClient } from '../database';

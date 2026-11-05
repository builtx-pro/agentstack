#!/usr/bin/env node
import { createCommand } from "./command.js";
import { reportError } from "./output.service.js";
try {
  await createCommand().parseAsync(process.argv);
} catch (error) {
  reportError(error, process.argv.includes("--json"));
  process.exitCode = 1;
}

const [, , label, delay, exitCode] = process.argv;

process.stdout.write(`${label}-out\n`);
process.stderr.write(`${label}-err\n`);

setTimeout(() => {
  process.stdout.write(`${label}-done\n`);
  process.exitCode = Number(exitCode);
}, Number(delay));

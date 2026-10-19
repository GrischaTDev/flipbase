import { access, mkdir } from 'node:fs/promises';
import { Architect } from '@angular-devkit/architect';
import { WorkspaceNodeModulesArchitectHost } from '@angular-devkit/architect/node/index.js';
import { workspaces, json } from '@angular-devkit/core';
import { NodeJsSyncHost, createConsoleLogger } from '@angular-devkit/core/node/index.js';

const previewDirectory = '.superpowers/apple-design-preview';
await mkdir(previewDirectory, { recursive: true });
const { workspace } = await workspaces.readWorkspace(
  'angular.json',
  workspaces.createWorkspaceHost(new NodeJsSyncHost()),
);
const build = workspace.projects.get('flipbase').targets.get('build');
build.options.browser = 'src/main.ts';
build.options.index = 'src/index.html';
const liveEnvironment = '.superpowers/dev-live/environment.ts';
const hasLiveEnvironment = await access(liveEnvironment).then(
  () => true,
  () => false,
);
if (!process.argv.includes('--build') && hasLiveEnvironment) {
  build.configurations.development.fileReplacements = [
    { replace: 'src/environments/environment.ts', with: liveEnvironment },
  ];
}
build.options.outputPath = previewDirectory + '/build';
const registry = new json.schema.CoreSchemaRegistry();
registry.addPostTransform(json.schema.transforms.addUndefinedDefaults);
const architect = new Architect(
  new WorkspaceNodeModulesArchitectHost(workspace, process.cwd()),
  registry,
);
const buildOnly = process.argv.includes('--build');
const run = await architect.scheduleTarget(
  {
    project: 'flipbase',
    target: buildOnly ? 'build' : 'serve',
    configuration: buildOnly ? 'production' : 'development',
  },
  buildOnly ? {} : { host: '127.0.0.1', port: 4201, proxyConfig: undefined },
  { logger: createConsoleLogger() },
);
process.on('SIGINT', async () => {
  await run.stop();
  process.exit();
});
if (buildOnly) {
  const result = await run.result;
  await run.stop();
  process.exitCode = result.success ? 0 : 1;
} else {
  run.output.subscribe({
    next: (result) => {
      if (result.success)
        console.log(
          'Designvorschau bereit: http://localhost:4201 – echte Flipbase-Übersicht unter /dashboard',
        );
    },
    error: (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  });
}

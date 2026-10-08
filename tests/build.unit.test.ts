import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './helpers/package';

test('alternate builds preserve unrelated files and remove only stale managed outputs', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'minkpdf-build-'));
	try {
		await Bun.write(join(directory, 'keep.txt'), 'User file');
		await Bun.write(join(directory, 'old.js'), 'Generated');
		await Bun.write(
			join(directory, '.minkpdf-build.json'),
			JSON.stringify(['old.js', './core.js'])
		);
		await run(
			[process.execPath, 'scripts/build.ts', `--outdir=${directory}`],
			new URL('../', import.meta.url).pathname
		);
		expect(await Bun.file(join(directory, 'keep.txt')).text()).toBe('User file');
		expect(await Bun.file(join(directory, 'old.js')).exists()).toBe(false);
		expect(await Bun.file(join(directory, 'core.js')).exists()).toBe(true);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

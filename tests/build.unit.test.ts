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
		const ledger = await Bun.file(join(directory, '.minkpdf-build.json')).json();
		expect(ledger).not.toContain('old.js');
		expect(ledger).toContain('core.js');
		expect(ledger).toContain('features/tables.js');
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test.each(['../outside.js', '/absolute.js', 'not-javascript.ts'])(
	'rejects unsafe build ledger path %s before modifying output',
	async (recorded) => {
		const directory = mkdtempSync(join(tmpdir(), 'minkpdf-build-'));
		const output = join(directory, 'output');
		const ledger = JSON.stringify(['old.js', recorded]);
		try {
			await Bun.write(join(directory, 'outside.js'), 'Outside file');
			await Bun.write(join(output, 'old.js'), 'Previous output');
			await Bun.write(join(output, 'core.js'), 'Previous core');
			await Bun.write(join(output, '.minkpdf-build.json'), ledger);
			await expect(
				run(
					[process.execPath, 'scripts/build.ts', `--outdir=${output}`],
					new URL('../', import.meta.url).pathname
				)
			).rejects.toThrow('Unexpected generated output path');
			expect(await Bun.file(join(directory, 'outside.js')).text()).toBe('Outside file');
			expect(await Bun.file(join(output, 'old.js')).text()).toBe('Previous output');
			expect(await Bun.file(join(output, 'core.js')).text()).toBe('Previous core');
			expect(await Bun.file(join(output, '.minkpdf-build.json')).text()).toBe(ledger);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}
);

test.each(['src', '.'])('rejects build output containing source: %s', async (outdir) => {
	await expect(
		run(
			[process.execPath, 'scripts/build.ts', `--outdir=${outdir}`],
			new URL('../', import.meta.url).pathname
		)
	).rejects.toThrow('Build output must not contain the source directory');
});

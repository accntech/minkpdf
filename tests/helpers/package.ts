import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function run(args: string[], cwd: string): Promise<string> {
	const child = Bun.spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe' });
	const [stdout, stderr, status] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited
	]);
	if (status !== 0) throw new Error(`${args[0]} failed (${status}):\n${stdout}\n${stderr}`);
	return stdout;
}

export async function packedConsumer() {
	const directory = mkdtempSync(join(tmpdir(), 'minkpdf-consumer-'));
	const stage = join(directory, 'stage');
	const consumer = join(directory, 'consumer');
	mkdirSync(stage);
	mkdirSync(consumer);
	try {
		for (const name of ['src', 'package.json', 'README.md', 'LICENSE', 'assets', 'docs'])
			cpSync(new URL(`../../${name}`, import.meta.url).pathname, join(stage, name), {
				recursive: true
			});
		const scripts = new URL('../../scripts/', import.meta.url).pathname;
		if (await Bun.file(join(scripts, 'build.ts')).exists())
			cpSync(scripts, join(stage, 'scripts'), { recursive: true });
		await run([process.execPath, 'run', 'build'], stage);
		const pack = JSON.parse(
			await run(
				['npm', 'pack', '--ignore-scripts', '--json', '--pack-destination', directory],
				stage
			)
		)[0];
		const tooling = await Bun.file(
			new URL('../fixtures/consumers/package.json', import.meta.url)
		).json();
		await Bun.write(
			join(consumer, 'package.json'),
			JSON.stringify({
				...tooling,
				dependencies: { minkpdf: `file:${join(directory, pack.filename)}` }
			})
		);
		await run(['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
		return {
			directory: consumer,
			packedFiles: pack.files.map((file: { path: string }) => file.path) as string[],
			dispose: () => rmSync(directory, { recursive: true, force: true })
		};
	} catch (error) {
		rmSync(directory, { recursive: true, force: true });
		throw error;
	}
}

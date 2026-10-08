import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, normalize, resolve } from 'node:path';

const root = new URL('../src/', import.meta.url).pathname;
const outputArgument = Bun.argv.find((argument) => argument.startsWith('--outdir='));
const outdir = resolve(
	outputArgument?.slice('--outdir='.length) ?? new URL('../dist/', import.meta.url).pathname
);
if (outdir === root.slice(0, -1) || root.startsWith(`${outdir}/`))
	throw new Error('Build output must not contain the source directory');
const entries = [...new Bun.Glob('**/*.ts').scanSync({ cwd: root, absolute: true })].sort();
const safeName = (path: string) => {
	const name = normalize(path);
	if (isAbsolute(name) || name.startsWith('..') || !name.endsWith('.js'))
		throw new Error(`Unexpected generated output path: ${path}`);
	return name;
};
const temporary = mkdtempSync(resolve(tmpdir(), 'minkpdf-output-'));
try {
	const child = Bun.spawn(
		[
			process.execPath,
			'build',
			...entries,
			'--no-bundle',
			'--target',
			'browser',
			'--format',
			'esm',
			'--root',
			root,
			'--outdir',
			temporary
		],
		{ stdout: 'pipe', stderr: 'pipe' }
	);
	const [stdout, stderr, status] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited
	]);
	if (status !== 0) throw new Error(`MinkPDF build failed:\n${stdout}\n${stderr}`);
	const outputs = [...new Bun.Glob('**/*.js').scanSync({ cwd: temporary })].map(safeName).sort();
	const ledger = Bun.file(resolve(outdir, '.minkpdf-build.json'));
	const recorded: string[] = (await ledger.exists()) ? await ledger.json() : [];
	const previous = recorded.map(safeName);
	// Keep unrelated files; remove only stale output recorded by this builder.
	mkdirSync(outdir, { recursive: true });
	for (const name of outputs)
		await Bun.write(resolve(outdir, name), Bun.file(resolve(temporary, name)));
	for (const name of previous)
		if (!outputs.includes(name)) rmSync(resolve(outdir, name), { force: true });
	await Bun.write(ledger, JSON.stringify(outputs) + '\n');
} finally {
	rmSync(temporary, { recursive: true, force: true });
}

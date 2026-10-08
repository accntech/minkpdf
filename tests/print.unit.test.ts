import { afterEach, expect, test } from 'bun:test';
import { createPdf } from '../src/core';

const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
const revoke = URL.revokeObjectURL;
let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
	URL.revokeObjectURL = revoke;
	if (original) Object.defineProperty(globalThis, 'window', original);
	else Reflect.deleteProperty(globalThis, 'window');
});
function browser(blocked = false) {
	const target = Object.assign(new EventTarget(), {
		closed: false,
		location: { href: '' },
		close() {
			this.closed = true;
		}
	});
	let opens = 0;
	let interval: (() => void) | undefined;
	const owner = {
		open() {
			opens++;
			return blocked ? null : target;
		},
		setInterval(callback: () => void) {
			interval = callback;
			return 1;
		},
		clearInterval() {
			interval = undefined;
		}
	};
	Object.defineProperty(globalThis, 'window', { configurable: true, value: owner });
	cleanup = () => {
		target.dispatchEvent(new Event('afterprint'));
		if (target.location.href) revoke(target.location.href);
	};
	return { target: target as unknown as Window, opens: () => opens, poll: () => interval?.() };
}

test('print opens synchronously and navigates to a printable PDF without altering ordinary output', async () => {
	const environment = browser();
	const document = createPdf({ content: 'Invoice' });
	const printing = document.print();
	expect(environment.opens()).toBe(1);
	await printing;
	const bytes = new Uint8Array(await (await fetch(environment.target.location.href)).arrayBuffer());
	expect(new TextDecoder().decode(bytes)).toContain('/OpenAction << /S /Named /N /Print >>');
	expect(new TextDecoder().decode(await document.getBuffer())).not.toContain('/OpenAction');
});

test('print uses the supplied target and releases its object URL after printing', async () => {
	const environment = browser();
	const revoked: string[] = [];
	URL.revokeObjectURL = (url) => {
		revoked.push(url);
		revoke(url);
	};
	await createPdf({ content: 'Invoice' }).print(environment.target);
	expect(environment.opens()).toBe(0);
	const url = environment.target.location.href;
	environment.target.dispatchEvent(new Event('afterprint'));
	expect(revoked).toEqual([url]);
	environment.target.dispatchEvent(new Event('afterprint'));
	expect(revoked).toEqual([url]);
});

test('print releases its object URL when the target closes', async () => {
	const environment = browser();
	const revoked: string[] = [];
	URL.revokeObjectURL = (url) => {
		revoked.push(url);
		revoke(url);
	};
	await createPdf({ content: 'Invoice' }).print(environment.target);
	const url = environment.target.location.href;
	environment.target.close();
	environment.poll();
	expect(revoked).toEqual([url]);
});

test('print rejects blocked popups and non-browser use clearly', async () => {
	browser(true);
	await expect(createPdf({ content: 'Invoice' }).print()).rejects.toThrow('blocked');
	Reflect.deleteProperty(globalThis, 'window');
	await expect(createPdf({ content: 'Invoice' }).print()).rejects.toThrow('browser');
});

test('print closes an automatically opened window when rendering fails', async () => {
	const environment = browser();
	await expect(createPdf({ content: 'José' }).print()).rejects.toThrow('TrueType');
	expect(environment.target.closed).toBe(true);
});

test('print rejects a target closed while rendering', async () => {
	const environment = browser();
	const printing = createPdf({ content: 'Invoice' }).print(environment.target);
	environment.target.close();
	await expect(printing).rejects.toThrow('closed');
	expect(environment.target.location.href).toBe('');
});

test('print releases its object URL if navigation fails without closing a supplied window', async () => {
	const environment = browser();
	const revoked: string[] = [];
	URL.revokeObjectURL = (url) => {
		revoked.push(url);
		revoke(url);
	};
	Object.defineProperty(environment.target.location, 'href', {
		configurable: true,
		get: () => '',
		set: () => {
			throw new Error('Navigation failed');
		}
	});
	await expect(createPdf({ content: 'Invoice' }).print(environment.target)).rejects.toThrow(
		'Navigation failed'
	);
	expect(revoked).toHaveLength(1);
	expect(environment.target.closed).toBe(false);
	environment.poll();
	expect(revoked).toHaveLength(1);
});

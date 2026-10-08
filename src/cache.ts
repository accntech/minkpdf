/** Cache successful object creation without repeating the lookup on a hit. */
export function cached<K, V extends object>(cache: Map<K, V>, key: K, create: () => V): V {
	let value = cache.get(key);
	if (value === undefined) {
		value = create();
		cache.set(key, value);
	}
	return value;
}

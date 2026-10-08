import solar from './solar-icons.json';

export type SolarIcon = keyof typeof solar.icons;

// Solar by 480 Design, CC BY 4.0. SVG paths are unmodified; size and color inherit from CSS.
export const icon = (name: SolarIcon) =>
	`<svg class="solar-icon" data-solar="${name}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${solar.icons[name]}</svg>`;

export const navigationIcons: Record<string, SolarIcon> = {
	index: 'book-bookmark-linear',
	'getting-started': 'bolt-linear',
	installation: 'download-minimalistic-linear',
	api: 'code-square-linear',
	comparison: 'transfer-horizontal-linear',
	benchmarks: 'chart-linear'
};

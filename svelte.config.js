import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// The app is entirely client-side: the physics runs in the browser and
		// there is no server component, so it prerenders to static files that
		// any static host can serve.
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: false
		}),
		prerender: { entries: ['*'] }
	}
};

export default config;

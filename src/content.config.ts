import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Commerspective: essays on commerce and finance, originally published on Wix (Oct 2024 to Jan 2025)
const blog = defineCollection({
	loader: glob({ pattern: '*.md', base: './src/content/blog' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			pubDate: z.coerce.date(),
			cover: image().optional(),
			readingTime: z.string().optional(),
		}),
});

export const collections = { blog };

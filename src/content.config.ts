import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) => z.object({
    title: z.string(),
    description: z.string().default(''),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    categories: z.array(z.string()).default([]),
    language: z.string().default('zh-CN'),
    draft: z.boolean().default(false),
    comment: z.boolean().default(true),
    heroImage: z.object({
      src: image(),
      alt: z.string().optional(),
      inferSize: z.boolean().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      color: z.string().optional()
    }).optional(),
    originalPath: z.string().optional()
  })
})

export const collections = { blog }

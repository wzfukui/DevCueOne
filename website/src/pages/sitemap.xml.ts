import type { APIRoute } from 'astro'
import { buildAbsoluteUrl, sitemapRoutes } from '../data/seo'

export const GET: APIRoute = () => {
  const lastmod = new Date().toISOString()
  const urls = sitemapRoutes
    .map(
      (route) => `
  <url>
    <loc>${buildAbsoluteUrl(route)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${route === '/en/' || route === '/zh/' ? '1.0' : '0.5'}</priority>
  </url>`
    )
    .join('')

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  })
}

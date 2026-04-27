// Footer — React port of the marketing site's FooterLarge02Brand.astro
// (`/marketing-site/nextworkmarketing/src/components/untitled-ui/marketing/footer/FooterLarge02Brand.astro`).
//
// Same shape: brand block (logo + tagline) on the left, four nav columns
// on the right, then a bottom row with copyright + social icons. Sections
// and social links are mirrored from `footer-config.ts` in the marketing
// repo to keep voice + URLs consistent across surfaces.
//
// Design tokens: leather background to flow continuously from the dark
// browse panel above (no seam between sections — the panel and footer
// share #1A1918). Nav text in white with muted gray for tagline + small
// labels, matching the marketing footer.

import { Wordmark } from '@/components/discovery/Wordmark'

interface FooterLink {
  name: string
  href: string
}

interface FooterSection {
  title: string
  links: FooterLink[]
}

interface SocialLink {
  name: string
  href: string
  icon: React.ReactNode
}

const FOOTER_SECTIONS: FooterSection[] = [
  {
    title: 'Product',
    links: [
      { name: 'Roadmaps', href: '/roadmaps' },
      { name: 'Projects', href: '/projects' },
    ],
  },
  {
    title: 'Company',
    links: [
      { name: 'About Us', href: '/about' },
      { name: 'Contact', href: 'mailto:maya@nextwork.org' },
    ],
  },
  {
    title: 'Community',
    links: [
      { name: 'Meet Our Learners', href: '/stories' },
      { name: 'Discord', href: 'https://community.nextwork.org' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { name: 'Privacy Policy', href: '/legal/privacy-policy' },
      { name: 'Terms of Service', href: '/legal/terms-conditions' },
    ],
  },
]

// Social SVGs lifted verbatim from `footer-config.ts` in the marketing
// site so the icon set stays identical between surfaces.
const InstagramIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
)

const LinkedInIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </svg>
)

const TwitterIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)

const YouTubeIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <path d="m10 15 5-3-5-3z" />
  </svg>
)

const TikTokIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
  </svg>
)

const SOCIAL_LINKS: SocialLink[] = [
  { name: 'Instagram', href: 'https://www.instagram.com/itsnextwork/', icon: InstagramIcon },
  { name: 'LinkedIn', href: 'https://www.linkedin.com/school/itsnextwork/posts/', icon: LinkedInIcon },
  { name: 'X (Twitter)', href: 'https://twitter.com/itsnextwork', icon: TwitterIcon },
  { name: 'YouTube', href: 'https://www.youtube.com/@itsnextwork', icon: YouTubeIcon },
  { name: 'TikTok', href: 'https://www.tiktok.com/@itsnextwork', icon: TikTokIcon },
]

const TAGLINE = "Building the world's best learning experience for skills."

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="w-full" style={{ paddingInline: 'clamp(2.5rem, 5vw, 5rem)' }}>
      {/* Top section — brand on the left, four nav columns on the right.
          Layout collapses to a vertical stack below xl. */}
      <div className="flex flex-col gap-12 py-12 md:gap-16 xl:flex-row">
        <div className="flex flex-col gap-6 md:w-80">
          <a href="/" className="inline-block" aria-label="NextWork home">
            <Wordmark width={140} className="text-white" />
          </a>
          <p className="font-heading text-[15px]/[1.5] text-white/70">{TAGLINE}</p>
        </div>

        <nav className="flex-1" aria-label="Footer">
          <ul className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {FOOTER_SECTIONS.map((section) => (
              <li key={section.title}>
                <h4 className="mb-4 font-heading text-[13px]/[1.4] font-semibold text-white">
                  {section.title}
                </h4>
                <ul className="flex flex-col gap-3">
                  {section.links.map((link) => (
                    <li key={link.name}>
                      <a
                        href={link.href}
                        className="font-heading text-[13px]/[1.4] text-white/70 transition-colors duration-200 hover:text-white"
                      >
                        {link.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Bottom row — copyright on the left, social icons on the right. */}
      <div className="flex flex-col-reverse justify-between gap-6 border-t border-white/10 py-8 md:flex-row md:items-center">
        <p className="font-heading text-[13px]/[1.4] text-white/50">
          © {year} NextWork. All rights reserved.
        </p>
        <ul className="flex gap-6">
          {SOCIAL_LINKS.map((social) => (
            <li key={social.name}>
              <a
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.name}
                className="flex text-white/70 transition-colors duration-200 hover:text-white"
              >
                {social.icon}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  )
}

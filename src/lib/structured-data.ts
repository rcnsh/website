/**
 * The schema.org graph the site publishes on every page.
 *
 * One `@graph` rather than a scatter of standalone blocks, so the nodes can
 * point at each other by `@id`: the page is part of the site, the site is
 * published by the organisation, the organisation is founded by the person.
 * A parser that wants the contact details finds them in one place, and a
 * parser that wants "who is this" gets an answer that resolves.
 *
 * Nothing here is invented. Every field comes from src/content/site.json or
 * from the page being rendered — see the note beside `organization` there.
 */

export interface JsonLdNode {
  "@type": string | string[];
  "@id"?: string;
  [key: string]: unknown;
}

export interface IdentityInput {
  siteName: string;
  /** Origin, no trailing slash. */
  url: string;
  author: string;
  tagline: string;
  description: string;
  email: string;
  contactType: string;
  locality: string;
  country: string;
  sameAs: string[];
  /** Absolute URL of the share card, reused as the site's image. */
  image: string;
}

export interface PageInput {
  /** Absolute canonical URL of the page being rendered. */
  canonical: string;
  /** The `<title>`, without the site-name prefix. */
  name: string;
  description: string;
}

export interface ArticleInput extends PageInput {
  published: Date;
  modified?: Date;
}

const PERSON = "#person";
const ORGANISATION = "#organisation";
const WEBSITE = "#website";

/** Trailing slashes make `@id` values that don't match the canonical URLs. */
const trimSlash = (url: string) => url.replace(/\/+$/, "");

/**
 * The three identity nodes. They are the same on every page, which is the
 * point — a crawler that reads two pages gets one consistent answer.
 */
export function identityNodes(identity: IdentityInput): JsonLdNode[] {
  const origin = trimSlash(identity.url);

  return [
    {
      "@type": "Person",
      "@id": `${origin}/${PERSON}`,
      name: identity.author,
      url: `${origin}/`,
      description: identity.tagline,
      email: `mailto:${identity.email}`,
      image: identity.image,
      address: {
        "@type": "PostalAddress",
        addressLocality: identity.locality,
        addressCountry: identity.country,
      },
      sameAs: identity.sameAs,
    },
    {
      "@type": "Organization",
      "@id": `${origin}/${ORGANISATION}`,
      name: identity.siteName,
      url: `${origin}/`,
      description: identity.description,
      logo: identity.image,
      founder: { "@id": `${origin}/${PERSON}` },
      /* Both halves of what a verifier looks for: a reachable contact and a
         place. City-level only, deliberately. */
      contactPoint: {
        "@type": "ContactPoint",
        contactType: identity.contactType,
        email: identity.email,
        url: `${origin}/contact`,
        availableLanguage: ["en"],
      },
      address: {
        "@type": "PostalAddress",
        addressLocality: identity.locality,
        addressCountry: identity.country,
      },
      sameAs: identity.sameAs,
    },
    {
      "@type": "WebSite",
      "@id": `${origin}/${WEBSITE}`,
      name: identity.siteName,
      url: `${origin}/`,
      description: identity.description,
      inLanguage: "en",
      publisher: { "@id": `${origin}/${ORGANISATION}` },
      author: { "@id": `${origin}/${PERSON}` },
    },
  ];
}

/** The node for the page currently being rendered. */
export function pageNode(
  identity: IdentityInput,
  page: PageInput,
  article?: Pick<ArticleInput, "published" | "modified">,
): JsonLdNode {
  const origin = trimSlash(identity.url);
  const canonical = trimSlash(page.canonical) || `${origin}/`;

  const base: JsonLdNode = {
    "@type": article ? "BlogPosting" : "WebPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: page.name,
    description: page.description,
    isPartOf: { "@id": `${origin}/${WEBSITE}` },
    inLanguage: "en",
    author: { "@id": `${origin}/${PERSON}` },
    publisher: { "@id": `${origin}/${ORGANISATION}` },
  };

  if (!article) {
    // A WebPage is *about* the person; a BlogPosting is about its own subject.
    base.about = { "@id": `${origin}/${PERSON}` };
    return base;
  }

  base.headline = page.name;
  base.datePublished = article.published.toISOString();
  if (article.modified) {
    base.dateModified = article.modified.toISOString();
  }
  base.mainEntityOfPage = { "@id": `${canonical}#webpage` };

  return base;
}

/** The whole document, ready to be serialised into a script tag. */
export function structuredData(
  identity: IdentityInput,
  page: PageInput,
  article?: Pick<ArticleInput, "published" | "modified">,
) {
  return {
    "@context": "https://schema.org",
    "@graph": [...identityNodes(identity), pageNode(identity, page, article)],
  };
}

/**
 * Serialises for embedding in HTML.
 *
 * `<` is escaped because a `</script>` inside any string value would otherwise
 * close the block early — the one way a JSON-LD tag can break a page.
 */
export function serialiseJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

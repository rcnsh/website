import { test } from "node:test";
import assert from "node:assert/strict";
import {
  identityNodes,
  pageNode,
  serialiseJsonLd,
  structuredData,
  type IdentityInput,
  type JsonLdNode,
} from "./structured-data.ts";

const IDENTITY: IdentityInput = {
  siteName: "rcn.sh",
  url: "https://rcn.sh",
  author: "Jacob Wiltshire",
  tagline: "computer science student",
  description: "Personal site.",
  email: "someone@example.com",
  contactType: "general enquiries",
  locality: "Newcastle upon Tyne",
  country: "GB",
  sameAs: ["https://github.com/rcnsh"],
  image: "https://rcn.sh/og.png",
};

const PAGE = {
  canonical: "https://rcn.sh/about",
  name: "About",
  description: "Who I am.",
};

const byType = (nodes: JsonLdNode[], type: string) =>
  nodes.find((node) => node["@type"] === type);

test("the graph carries Person, Organization and WebSite", () => {
  const nodes = identityNodes(IDENTITY);
  assert.equal(nodes.length, 3);

  for (const type of ["Person", "Organization", "WebSite"]) {
    assert.ok(byType(nodes, type), `missing ${type}`);
  }
});

test("Organization has both a contactPoint and an address", () => {
  // The two fields the completeness check looks for, together.
  const org = byType(identityNodes(IDENTITY), "Organization");

  assert.deepEqual(org?.contactPoint, {
    "@type": "ContactPoint",
    contactType: "general enquiries",
    email: "someone@example.com",
    url: "https://rcn.sh/contact",
    availableLanguage: ["en"],
  });

  assert.deepEqual(org?.address, {
    "@type": "PostalAddress",
    addressLocality: "Newcastle upon Tyne",
    addressCountry: "GB",
  });
});

test("the address stays at city level", () => {
  const nodes = identityNodes(IDENTITY);
  const addresses = nodes
    .map((node) => node.address as Record<string, unknown> | undefined)
    .filter(Boolean);

  assert.ok(addresses.length > 0);
  for (const address of addresses) {
    assert.ok(
      !("streetAddress" in address!) && !("postalCode" in address!),
      "a personal site must not publish a street address",
    );
  }
});

test("every internal reference resolves to a node in the graph", () => {
  const graph = structuredData(IDENTITY, PAGE)["@graph"];
  const ids = new Set(graph.map((node) => node["@id"]));

  const references: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    // A bare `{ "@id": ... }` is a reference; anything with a type is a node.
    if ("@id" in record && !("@type" in record)) {
      references.push(String(record["@id"]));
    }
    for (const nested of Object.values(record)) walk(nested);
  };

  walk(graph);

  assert.ok(references.length >= 5, "expected the nodes to cross-reference");
  for (const reference of references) {
    assert.ok(ids.has(reference), `dangling @id reference: ${reference}`);
  }
});

test("ids are stable regardless of a trailing slash in the site url", () => {
  const withSlash = identityNodes({ ...IDENTITY, url: "https://rcn.sh/" });
  assert.deepEqual(withSlash, identityNodes(IDENTITY));
});

test("a plain page is a WebPage about the person", () => {
  const node = pageNode(IDENTITY, PAGE);

  assert.equal(node["@type"], "WebPage");
  assert.equal(node["@id"], "https://rcn.sh/about#webpage");
  assert.equal(node.url, "https://rcn.sh/about");
  assert.deepEqual(node.about, { "@id": "https://rcn.sh/#person" });
  assert.ok(!("datePublished" in node));
});

test("a post is a BlogPosting with its dates", () => {
  const node = pageNode(IDENTITY, PAGE, {
    published: new Date("2026-01-02T00:00:00Z"),
    modified: new Date("2026-03-04T00:00:00Z"),
  });

  assert.equal(node["@type"], "BlogPosting");
  assert.equal(node.headline, "About");
  assert.equal(node.datePublished, "2026-01-02T00:00:00.000Z");
  assert.equal(node.dateModified, "2026-03-04T00:00:00.000Z");
});

test("an unmodified post has no dateModified", () => {
  const node = pageNode(IDENTITY, PAGE, {
    published: new Date("2026-01-02T00:00:00Z"),
  });
  assert.ok(!("dateModified" in node));
});

test("the homepage canonical does not collapse to an empty id", () => {
  const node = pageNode(IDENTITY, { ...PAGE, canonical: "https://rcn.sh/" });
  assert.equal(node.url, "https://rcn.sh");
});

test("serialising escapes anything that could close the script tag", () => {
  const output = serialiseJsonLd({ name: "</script><img onerror=x>" });

  assert.ok(!output.includes("</script>"));
  assert.ok(output.includes("\\u003c/script>"));
  assert.deepEqual(JSON.parse(output), { name: "</script><img onerror=x>" });
});

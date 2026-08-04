/**
 * Renders a JSON-LD structured data block.
 *
 * Pass a complete document (use `graph(...)` from @/lib/schema to build one).
 * The `<` escaping prevents a stray closing tag inside string values from
 * breaking out of the script element.
 */
export function JsonLd({ schema }: { schema: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
      }}
    />
  );
}

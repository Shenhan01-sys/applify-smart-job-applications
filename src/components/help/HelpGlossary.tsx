import { HELP_EXTRA_GLOSSARY, HELP_GLOSSARY } from "./helpContent";

export function HelpGlossary() {
  const items = [...HELP_GLOSSARY, ...HELP_EXTRA_GLOSSARY];
  return (
    <dl className="mt-3 space-y-3 text-sm leading-relaxed">
      {items.map((item) => (
        <div key={item.term}>
          <dt className="font-semibold">{item.term}</dt>
          <dd className="text-foreground/90">{item.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

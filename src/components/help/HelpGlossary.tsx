import { HELP_GLOSSARY } from "./helpContent";

export function HelpGlossary() {
  return (
    <dl className="mt-3 space-y-3 text-sm leading-relaxed">
      {HELP_GLOSSARY.map((item) => (
        <div key={item.term}>
          <dt className="font-semibold">{item.term}</dt>
          <dd className="text-foreground/90">{item.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

import { HELP_FAQ } from "./helpContent";

export function HelpFaq() {
  return (
    <div className="mt-3 space-y-4">
      {HELP_FAQ.map((item) => (
        <div key={item.question}>
          <h3 className="text-sm font-semibold">{item.question}</h3>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">{item.answer}</p>
        </div>
      ))}
    </div>
  );
}

import { HELP_STEPS } from "./helpContent";

export function HelpSteps() {
  return (
    <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-foreground/90">
      {HELP_STEPS.map((step) => (
        <li key={step.title}>
          <span className="font-semibold">{step.title}.</span> {step.detail}
        </li>
      ))}
    </ol>
  );
}

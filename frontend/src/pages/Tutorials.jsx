import { Card, Head, Page } from "../components/ui";

const LESSONS = [
  ["Observe before you act", "A browser agent sees a screenshot plus a simplified DOM: only elements that are visible and reachable right now. Anything behind a scroll does not exist until you scroll.", ["Collect visible buttons, inputs and selects", "Tag each with a stable id", "List scrollable regions separately"]],
  ["One action per step", "Pick exactly one of click, type, select, scroll or wait. Small steps make failures obvious and replays readable.", ["Return strict JSON", "Validate the target id", "Record the result and screenshot"]],
  ["Read the signs, skip the decoys", "Obstacle courses hide the real path behind instructions. The flashiest button is usually a trap.", ["Quote the instruction in your reasoning", "Prefer the element matching the plaque or hint", "Count decoys as a cost"]],
  ["Gate before you trust", "A gatekeeper checks the extracted payload against evidence before anything is dispatched. Jev returns calibrated probabilities, not prose.", ["Schema check locally", "Ask Jev: choice, score, noul", "Fail closed when unsure"]],
  ["Ship it as a skill", "Export your crab as a standalone Python Playwright runner that uses your own key.", ["Export from the Export tab (Pro)", "Set your provider key", "Run it against any safe URL"]],
];

export default function Tutorials() {
  return (
    <Page testId="tutorials-page">
      <Head eyebrow="Tutorials" title="Learn to build browser agents">Five short lessons that map directly to how the Arena scores your crab.</Head>
      <div className="grid two">
        {LESSONS.map(([title, copy, steps], i) => (
          <Card key={title} tint={["coral", "sun", "lagoon", "sky", "grape"][i]} testId={`lesson-${i + 1}`}>
            <p className="eyebrow">Lesson {i + 1}</p><h3>{title}</h3><p>{copy}</p>
            <ol>{steps.map(s => <li key={s}>{s}</li>)}</ol>
          </Card>
        ))}
      </div>
    </Page>
  );
}

export default function FloatingDock({ onRun }: { onRun: () => void }) {
 return <button type="button" className="rounded-full bg-ink px-4 py-2 text-xs text-canvas" onClick={onRun}>Dry-run</button>;
}

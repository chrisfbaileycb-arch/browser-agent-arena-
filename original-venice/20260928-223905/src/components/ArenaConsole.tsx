export default function ArenaConsole({ log }: { log: string[] }) {
 return <pre className="font-mono nr-card p-3 text-[10px]">{log.join("\n") || "idle"}</pre>;
}

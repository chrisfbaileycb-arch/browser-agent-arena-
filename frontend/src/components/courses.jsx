export const COURSES = {
  "obstacle-1": {
    id: "obstacle-1", short: "Tidepool Gauntlet", theme: "tidepool",
    stations: ["start", "wall", "doors", "rope", "beam", "tunnel", "finish"],
    names: ["Start", "Wall", "Doors", "Rope", "Beam", "Tunnel", "Finish"],
    cleared: { start: "OFF THE LINE!", wall: "WALL CLEARED!", doors: "DECOY DODGED!", rope: "ROPE CLIMBED!", beam: "BEAM BALANCED!", tunnel: "TUNNEL CRAWLED!" },
  },
  "kelp-2": {
    id: "kelp-2", short: "Kelp Forest Circuit", theme: "kelp",
    stations: ["entry", "current", "maze", "crates", "tide", "cave", "lookalike", "finish"],
    names: ["Gate", "Current", "Maze", "Crates", "Tide", "Cave", "Mirror", "Buoy"],
    cleared: { entry: "AMBUSH DODGED!", current: "BUOY HOOKED!", maze: "MAZE SOLVED!", crates: "CRATES STACKED!", tide: "RODE THE TIDE!", cave: "PASSWORD SPOKEN!", lookalike: "REAL EXIT FOUND!" },
  },
};
export const COURSE_IDS = Object.keys(COURSES);
export const courseOf = id => COURSES[id] || COURSES["obstacle-1"];

export function stationOf(url, courseId) {
  const m = /\/courses\/([^/?]+)\/([a-z]+)/.exec(url || "");
  const course = courseOf(courseId || m?.[1]);
  return m ? Math.max(0, course.stations.indexOf(m[2])) : 0;
}

export function CoursePicker({ value, onChange, testId = "course-picker" }) {
  return (
    <div className="row wrap course-picker" role="tablist" data-testid={testId}>
      {COURSE_IDS.map(id => (
        <button key={id} role="tab" aria-selected={value === id} className={`chip course-chip theme-${COURSES[id].theme} ${value === id ? "on" : ""}`}
          onClick={() => onChange(id)} data-testid={`${testId}-${id}`}>{COURSES[id].short}</button>
      ))}
    </div>
  );
}

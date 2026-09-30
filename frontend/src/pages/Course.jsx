import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api, BACKEND } from "../api";
import { Card, Head, Page } from "../components/ui";
import Broadcast from "../components/Broadcast";

const TINTS = ["coral", "sun", "lagoon", "sky", "grape", "coral", "sun"];

export default function CoursePage() {
  const [course, setCourse] = useState(null);
  const [replays, setReplays] = useState([]);
  useEffect(() => {
    api("/courses").then(c => setCourse(c[0])).catch(() => {});
    api("/replays?course_id=obstacle-1").then(setReplays).catch(() => {});
  }, []);
  return (
    <Page testId="course-page">
      <Head eyebrow="Obstacle Course" title={course?.name || "The Tidepool Gauntlet"}>Seven linked stations served as real pages. Any agent can run it; progress and the finish code are tracked server-side per attempt, so skipping stations is impossible.</Head>
      <a className="btn btn-primary" href={`${BACKEND}/api/courses/obstacle-1`} target="_blank" rel="noreferrer" data-testid="open-course-btn">Try the course yourself <ExternalLink size={15} /></a>
      {replays.length > 0 && <Broadcast runIds={replays.slice(0, 2).map(r => r.id)} title="Champion replay duel" />}
      <ol className="stations">
        {course?.stations.map((s, i) => (
          <Card key={s.id} tint={TINTS[i]} testId={`station-card-${s.id}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}>
            <span className="station-num">{i + 1}</span><h3>{s.name}</h3><p>{s.obstacle}</p>
          </Card>
        ))}
      </ol>
    </Page>
  );
}

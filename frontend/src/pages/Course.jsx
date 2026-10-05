import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { api, BACKEND } from "../api";
import { Card, Head, Page } from "../components/ui";
import Broadcast from "../components/Broadcast";
import { COURSE_IDS, CoursePicker } from "../components/courses";

const TINTS = ["coral", "sun", "lagoon", "sky", "grape", "coral", "sun", "lagoon"];

export default function CoursePage() {
  const params = useParams();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const id = COURSE_IDS.includes(params.id) ? params.id : "obstacle-1";
  const setId = next => navigate(`/courses/${next}`);
  const [replays, setReplays] = useState([]);
  const course = courses.find(c => c.id === id);
  useEffect(() => { api("/courses").then(setCourses).catch(() => {}); }, []);
  useEffect(() => { setReplays([]); api(`/replays?course_id=${id}`).then(setReplays).catch(() => {}); }, [id]);
  return (
    <Page testId="course-page">
      <Head eyebrow="Obstacle Course" title={course?.name || "The Tidepool Gauntlet"}>{id === "kelp-2" ? "Eight linked stations with brand-new obstacle types. Every attempt reshuffles wording, order, decoys and element ids from a per-attempt seed, and the server checks each station's answer." : "Seven linked stations served as real pages. Any agent can run it; progress and the finish code are tracked server-side per attempt, so skipping stations is impossible."}</Head>
      <CoursePicker value={id} onChange={setId} testId="course-page-picker" />
      <a className="btn btn-primary" href={`${BACKEND}/api/courses/${id}`} target="_blank" rel="noreferrer" data-testid="open-course-btn">Try the course yourself <ExternalLink size={15} /></a>
      {replays.length > 0 && <Broadcast key={id} runIds={replays.slice(0, 2).map(r => r.id)} title="Champion replay duel" />}
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

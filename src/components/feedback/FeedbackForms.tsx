"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import type { FeedbackState } from "@/app/(site)/feedback/actions";

type Action = (s: FeedbackState, fd: FormData) => Promise<FeedbackState>;

function Status({ state }: { state: FeedbackState }) {
  if (!state) return null;
  return <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>;
}

export interface ProjectOption {
  slug: string;
  title: string;
  specs: { id: string; name: string }[];
  results: { id: string; name: string; specId: string | null }[];
}

/** Ask for feedback on one of your simulations: project, spec, result, question. */
export function RequestFeedbackForm({ action, projects, initial }: { action: Action; projects: ProjectOption[]; initial?: { project?: string; spec?: string; result?: string } }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [slug, setSlug] = useState(initial?.project ?? projects[0]?.slug ?? "");
  const project = projects.find((p) => p.slug === slug);
  const [specId, setSpecId] = useState(initial?.spec ?? project?.specs[0]?.id ?? "");
  useEffect(() => {
    if (project && !project.specs.some((s) => s.id === specId)) setSpecId(project.specs[0]?.id ?? "");
  }, [project, specId]);
  const results = project?.results.filter((r) => !r.specId || r.specId === specId) ?? [];
  if (projects.length === 0) return <p className="text-sm text-muted">Create a public or unlisted project with a spec first.</p>;
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="fb-project">Project</label>
          <select id="fb-project" name="project" className="input" value={slug} onChange={(e) => setSlug(e.target.value)}>
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>{p.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fb-spec">Spec</label>
          <select id="fb-spec" name="spec" className="input" value={specId} onChange={(e) => setSpecId(e.target.value)}>
            {project?.specs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fb-result">Result</label>
          <select id="fb-result" name="result" className="input" defaultValue={initial?.result ?? results[0]?.id ?? ""} key={`${slug}-${specId}`}>
            <option value="">No result yet</option>
            {results.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="fb-title">Title</label>
        <input id="fb-title" name="title" className="input" required minLength={8} maxLength={160} placeholder="e.g. Is the plasmon peak of this 40 nm gold sphere right?" />
      </div>
      <MarkdownEditor name="question" label="Your question" required rows={6} placeholder="What do you want checked, and what would convince you? Markdown and $LaTeX$ work." />
      <fieldset>
        <legend className="label">What kind of answer do you want?</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {[
            ["review", "A review of the setup"],
            ["reproduce", "An independent re-run"],
            ["experiment", "A comparison with measurements"],
          ].map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-2">
              <input type="checkbox" name="wants" value={v} defaultChecked={v !== "experiment"} /> {l}
            </label>
          ))}
        </div>
      </fieldset>
      <Status state={state} />
      <button className="btn-primary" type="submit" disabled={pending}>{pending ? "Asking…" : "Ask for feedback"}</button>
    </form>
  );
}

function useResettingAction(action: Action) {
  const [state, formAction, pending] = useActionState(action, null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (state?.ok) setKey((k) => k + 1);
  }, [state]);
  return { state, formAction, pending, key };
}

/** The three ways to answer: comment, re-run, experiment. */
export function AnswerForms({ action, independent }: { action: Action; independent: boolean }) {
  const comment = useResettingAction(action);
  const rerun = useResettingAction(action);
  const exp = useResettingAction(action);
  const id = useId();
  return (
    <div className="space-y-3">
      <details className="card" open>
        <summary className="cursor-pointer font-medium">Comment</summary>
        <form action={comment.formAction} className="mt-3 space-y-3" key={comment.key}>
          <input type="hidden" name="kind" value="comment" />
          <MarkdownEditor name="body" label="Your comment" required rows={5} />
          <Status state={comment.state} />
          <button className="btn-primary" type="submit" disabled={comment.pending}>{comment.pending ? "Posting…" : "Post comment"}</button>
        </form>
      </details>
      {independent ? (
        <>
          <details className="card">
            <summary className="cursor-pointer font-medium">Report an independent re-run</summary>
            <form action={rerun.formAction} className="mt-3 space-y-3" key={rerun.key} encType="multipart/form-data">
              <input type="hidden" name="kind" value="reproduction" />
              <fieldset>
                <legend className="label">Outcome</legend>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="inline-flex items-center gap-2"><input type="radio" name="outcome" value="reproduced" required /> Reproduced it</label>
                  <label className="inline-flex items-center gap-2"><input type="radio" name="outcome" value="not_reproduced" /> Could not reproduce</label>
                </div>
              </fieldset>
              <div>
                <label className="label" htmlFor={`${id}-problem`}>The problem you ran (Lightsmith problem JSON)</label>
                <textarea id={`${id}-problem`} name="problem" className="input font-mono" rows={6} required spellCheck={false} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`${id}-rfile`}>Your result JSON file</label>
                  <input id={`${id}-rfile`} name="result_file" type="file" accept=".json,application/json" className="text-sm" />
                </div>
                <div>
                  <label className="label" htmlFor={`${id}-rtext`}>…or paste it</label>
                  <textarea id={`${id}-rtext`} name="result" className="input font-mono" rows={3} spellCheck={false} />
                </div>
              </div>
              <MarkdownEditor name="body" label="What you did and what you found" required rows={4} />
              <Status state={rerun.state} />
              <button className="btn-primary" type="submit" disabled={rerun.pending}>{rerun.pending ? "Saving…" : "Submit re-run"}</button>
            </form>
          </details>
          <details className="card">
            <summary className="cursor-pointer font-medium">Compare with an experiment</summary>
            <form action={exp.formAction} className="mt-3 space-y-3" key={exp.key} encType="multipart/form-data">
              <input type="hidden" name="kind" value="experiment" />
              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset>
                  <legend className="label">Does the measurement agree?</legend>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="inline-flex items-center gap-2"><input type="radio" name="outcome" value="agrees" required /> Agrees</label>
                    <label className="inline-flex items-center gap-2"><input type="radio" name="outcome" value="disagrees" /> Disagrees</label>
                    <label className="inline-flex items-center gap-2"><input type="radio" name="outcome" value="inconclusive" /> Inconclusive</label>
                  </div>
                </fieldset>
                <div>
                  <label className="label" htmlFor={`${id}-quantity`}>Measured quantity</label>
                  <select id={`${id}-quantity`} name="quantity" className="input">
                    {["reflectance", "transmittance", "absorptance", "extinction", "scattering", "absorption", "effective_index", "other"].map((q) => (
                      <option key={q} value={q}>{q.replace("_", " ")}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`${id}-dfile`}>Measured data (CSV or JSON)</label>
                  <input id={`${id}-dfile`} name="data_file" type="file" accept=".csv,.tsv,.txt,.json,text/csv,application/json" className="text-sm" />
                  <p className="mt-1 text-xs text-muted">Header row, wavelength first (nm; µm, eV or cm⁻¹ if the header says so), then one column per quantity.</p>
                </div>
                <div>
                  <label className="label" htmlFor={`${id}-dtext`}>…or paste it</label>
                  <textarea id={`${id}-dtext`} name="data" className="input font-mono" rows={4} spellCheck={false} placeholder={"wavelength_nm,R\n400,0.031\n450,0.018"} />
                </div>
              </div>
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="label">Sample</legend>
                {[
                  ["material", "Material"],
                  ["structure", "Structure"],
                  ["thickness_nm", "Thickness (nm)"],
                  ["substrate", "Substrate"],
                  ["fabrication", "Fabrication"],
                ].map(([k, l]) => (
                  <div key={k}>
                    <label className="text-xs text-muted" htmlFor={`${id}-s-${k}`}>{l}</label>
                    <input id={`${id}-s-${k}`} name={`sample_${k}`} className="input" maxLength={300} />
                  </div>
                ))}
              </fieldset>
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="label">Setup</legend>
                {[
                  ["instrument", "Instrument"],
                  ["source", "Light source"],
                  ["detector", "Detector"],
                  ["angle_deg", "Angle of incidence (°)"],
                  ["polarization", "Polarization"],
                  ["temperature_c", "Temperature (°C)"],
                ].map(([k, l]) => (
                  <div key={k}>
                    <label className="text-xs text-muted" htmlFor={`${id}-e-${k}`}>{l}</label>
                    <input id={`${id}-e-${k}`} name={`setup_${k}`} className="input" maxLength={300} />
                  </div>
                ))}
              </fieldset>
              <MarkdownEditor name="body" label="How you measured and what you see" required rows={4} />
              <Status state={exp.state} />
              <button className="btn-primary" type="submit" disabled={exp.pending}>{exp.pending ? "Saving…" : "Submit comparison"}</button>
            </form>
          </details>
        </>
      ) : (
        <p className="text-sm text-muted">Re-runs and experimental comparisons come from others: you (or an agent you operate) asked this question.</p>
      )}
    </div>
  );
}

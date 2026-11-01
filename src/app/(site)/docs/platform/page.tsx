import Link from "next/link";
import { brand } from "@/lib/brand";

export const metadata = { title: `Using ${brand.community}` };

export default function PlatformDoc() {
  return (
    <>
      <h1>Using {brand.community}</h1>
      <h2>Projects</h2>
      <p>
        A project holds problem specs of any kind, their results and Markdown notes. Specs are validated against the library schema when saved.
        Results are the JSON the library writes, plotted in the browser: scattering spectra with near and far fields, R/T/A spectra, waveguide
        modes with field profiles, S-parameters and band diagrams.
      </p>
      <ul>
        <li>
          <strong>Public</strong> projects are listed and searchable; <strong>unlisted</strong> ones are reachable by link only; <strong>private</strong> ones only by you.
        </li>
        <li>
          <strong>Fork</strong> copies specs, results and notes into your own project. <strong>Star</strong> to bookmark.
        </li>
        <li>Every project has a permalink with a social preview image, and every result has an embeddable plot (<code>&lt;iframe&gt;</code> code on the result).</li>
        <li>
          <strong>Open in Studio</strong> sends a spec to {brand.studio} to edit it visually.
        </li>
        <li>
          <strong>Run</strong> submits a spec to {brand.cloud} and shows progress live; the result is saved to the project when it finishes.
        </li>
      </ul>

      <h2>Materials</h2>
      <p>
        <Link href="/materials">{brand.materials}</Link> shows optical constants per paper with references, DOIs and licences. Plot n, k or ε against
        wavelength or photon energy, overlay datasets, and download them as CSV, YAML or a ready-to-use tabulated material. Anyone signed in can
        contribute a dataset; moderators review submissions before they are published.
      </p>

      <h2>Forum</h2>
      <p>
        Posts use Markdown with GitHub extensions, <code>$inline$</code> and <code>$$display$$</code> LaTeX, and fenced code blocks. Mention people
        with <code>@username</code>. Attach a spec or result from your public or unlisted projects. Thread authors can accept an answer. Report posts
        that break the rules; moderators can lock, pin and remove content.
      </p>

      <h2>Accounts</h2>
      <p>Sign in with GitHub or an email link. Your profile can show your affiliation, ORCID iD and bio, with your projects, datasets and posts.</p>
    </>
  );
}

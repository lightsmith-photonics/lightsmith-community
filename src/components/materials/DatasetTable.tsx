import Link from "next/link";
import type { DatasetSummary } from "@/lib/materials/types";

export function DownloadLinks({ id }: { id: string }) {
  return (
    <span className="flex flex-wrap gap-2">
      {(["csv", "yaml", "json"] as const).map((f) => (
        <a key={f} className="link text-xs" href={`/api/materials/datasets/${encodeURIComponent(id)}/download?format=${f}`} download>
          {f === "json" ? "Material JSON" : f.toUpperCase()}
        </a>
      ))}
    </span>
  );
}

export function DatasetTable({ datasets }: { datasets: DatasetSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <caption className="sr-only">Datasets</caption>
        <thead className="border-b border-line text-xs uppercase text-muted">
          <tr>
            <th scope="col" className="py-2 pr-3">Dataset</th>
            <th scope="col" className="py-2 pr-3">Authors</th>
            <th scope="col" className="py-2 pr-3">Year</th>
            <th scope="col" className="py-2 pr-3">Range (nm)</th>
            <th scope="col" className="py-2 pr-3">Licence</th>
            <th scope="col" className="py-2">Download</th>
          </tr>
        </thead>
        <tbody>
          {datasets.map((d) => (
            <tr key={d.id} className="border-b border-line align-top">
              <td className="py-2 pr-3">
                <Link className="link" href={`/materials/datasets/${encodeURIComponent(d.id)}`}>
                  {d.name}
                </Link>
                {d.is_default && <span className="badge ml-2">default</span>}
                {d.doi && (
                  <div>
                    <a className="text-xs text-muted hover:underline" href={`https://doi.org/${d.doi}`} rel="noopener">
                      doi:{d.doi}
                    </a>
                  </div>
                )}
              </td>
              <td className="max-w-xs py-2 pr-3">{d.authors}</td>
              <td className="py-2 pr-3 tabular-nums">{d.year ?? "—"}</td>
              <td className="py-2 pr-3 tabular-nums">
                {Math.round(d.range_nm[0])}–{Math.round(d.range_nm[1])}
              </td>
              <td className="py-2 pr-3">{d.license}</td>
              <td className="py-2">
                <DownloadLinks id={d.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

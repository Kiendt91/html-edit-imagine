import { Download } from "lucide-react";
import type { GenerationJob, RenderJob } from "../types";

type OutputPanelProps = {
  renderJob: RenderJob | null;
  generationJob: GenerationJob | null;
  generatedImage: string | null;
  exportedPng: string | null;
  codexPrompt: string;
};

export function OutputPanel({ renderJob, generationJob, generatedImage, exportedPng, codexPrompt }: OutputPanelProps) {
  return (
    <div className="renderPanel">
      <div className="panelTitle smallTitle">
        <Download size={15} />
        <span>Output</span>
      </div>
      {renderJob && (
        <div className="jobCard">
          <span>{renderJob.status}</span>
          <code>{renderJob.jobId}</code>
        </div>
      )}
      {generationJob && (
        <div className="jobCard generationJobCard">
          <span>{generationJob.status} - {generationJob.provider}</span>
          <code>{generationJob.jobId}</code>
        </div>
      )}
      {generatedImage && (
        <>
          <div className="outputLabel">Generated</div>
          <img className="generatedPreview" src={generatedImage} alt="Generated final output" />
        </>
      )}
      {exportedPng ? (
        <>
          <div className="outputLabel">Clean reference</div>
          <img className="outputPreview" src={exportedPng} alt="Exported layout reference" />
        </>
      ) : (
        <div className="emptyOutput">No exported PNG yet.</div>
      )}
      {codexPrompt && <textarea className="promptOutput" readOnly value={codexPrompt} />}
    </div>
  );
}

import { Copy, FolderOpen, RefreshCcw, Trash2 } from "lucide-react";
import type { ProjectSummary } from "../api";

type ProjectBrowserProps = {
  projects: ProjectSummary[];
  currentProjectId: string | null;
  onRefresh: () => void;
  onLoad: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

export function ProjectBrowser({ projects, currentProjectId, onRefresh, onLoad, onDuplicate, onDelete }: ProjectBrowserProps) {
  return (
    <div className="projectBrowser">
      <div className="panelTitle compactTitle">
        <FolderOpen size={16} />
        <span>Projects</span>
        <button className="iconButton" onClick={onRefresh} title="Refresh projects">
          <RefreshCcw size={14} />
        </button>
      </div>
      {projects.length === 0 ? (
        <div className="miniEmpty">No saved projects yet.</div>
      ) : (
        <div className="projectList">
          {projects.slice(0, 8).map((project) => (
            <article key={project.id} className={project.id === currentProjectId ? "projectCard currentProject" : "projectCard"}>
              <button className="projectOpenButton" onClick={() => onLoad(project.id)} title={`Open ${project.title}`}>
                <strong>{project.title}</strong>
                <span>{project.objectCount} objects - {project.canvas.width} x {project.canvas.height}</span>
              </button>
              <button className="iconButton" onClick={() => onDuplicate(project.id)} title={`Duplicate ${project.title}`}>
                <Copy size={14} />
              </button>
              <button className="iconButton dangerIcon" onClick={() => onDelete(project.id)} title={`Delete ${project.title}`}>
                <Trash2 size={14} />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

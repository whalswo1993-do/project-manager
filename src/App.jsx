import { useState } from "react";

export default function App() {
  const [projectName, setProjectName] = useState("");
  const [manager, setManager] = useState("");
  const [projects, setProjects] = useState([]);

  const addProject = () => {
    if (!projectName) return;

    setProjects([
      ...projects,
      {
        id: Date.now(),
        name: projectName,
        manager: manager,
      },
    ]);

    setProjectName("");
    setManager("");
  };

  const deleteProject = (id) => {
    setProjects(projects.filter((p) => p.id !== id));
  };

  return (
    <div style={{ padding: "40px" }}>
      <h1>프로젝트 관리 시스템</h1>

      <div style={{ marginTop: "20px" }}>
        <input
          placeholder="프로젝트명"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
        />

        <input
          placeholder="담당자"
          value={manager}
          onChange={(e) => setManager(e.target.value)}
          style={{ marginLeft: "10px" }}
        />

        <button
          onClick={addProject}
          style={{ marginLeft: "10px" }}
        >
          추가
        </button>
      </div>

      <hr />

      <h2>프로젝트 목록</h2>

      {projects.map((project) => (
        <div
          key={project.id}
          style={{
            border: "1px solid #ccc",
            padding: "10px",
            marginBottom: "10px",
          }}
        >
          <div>
            <strong>{project.name}</strong>
          </div>

          <div>담당자 : {project.manager}</div>

          <button
            onClick={() => deleteProject(project.id)}
            style={{
              marginTop: "10px",
              background: "red",
              color: "white",
            }}
          >
            삭제
          </button>
        </div>
      ))}
    </div>
  );
}
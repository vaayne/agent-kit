import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { WorkspaceNavigator } from "./src/WorkspaceNavigator.js";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "workspace-navigator",
    title: "Workspace Navigator",
    description: "Project → worktree → session, with status in place and pinned sessions.",
    component: WorkspaceNavigator,
  });
});

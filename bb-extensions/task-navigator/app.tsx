import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { TaskSidebar } from "./src/TaskSidebar.js";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "task-navigator",
    title: "Task Navigator",
    description: "Task → thread tree, with attention derived from facts.",
    component: TaskSidebar,
  });
});

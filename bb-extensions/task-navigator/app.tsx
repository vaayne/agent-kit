import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { InboxPanel } from "./src/InboxPanel.js";
import { OverviewTab } from "./src/OverviewTab.js";
import { TaskSidebar } from "./src/TaskSidebar.js";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "task-navigator",
    title: "Task Navigator",
    description: "Task → thread tree, with attention derived from facts.",
    component: TaskSidebar,
  });
  app.slots.navPanel({
    id: "task-navigator",
    title: "Task Navigator",
    icon: "ListChecks",
    path: "inbox",
    component: InboxPanel,
    fixedTabs: [{
      panelId: "task-navigator",
      id: "overview",
      title: "全景",
      icon: "LayoutGrid",
      component: OverviewTab,
    }],
  });
});

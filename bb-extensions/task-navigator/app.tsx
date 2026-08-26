import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { InboxPanel } from "./src/InboxPanel.js";
import { NewTaskAction } from "./src/NewTaskAction.js";
import { OverviewTab } from "./src/OverviewTab.js";
import { ThreadTaskPanel } from "./src/ThreadTaskPanel.js";
import { TaskSidebar } from "./src/TaskSidebar.js";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "task-navigator",
    title: "Task Navigator",
    description: "Task → thread tree, with attention derived from facts.",
    component: TaskSidebar,
  });
  app.slots.threadPanelAction({
    id: "task",
    title: "所属 task",
    icon: "ListChecks",
    component: ThreadTaskPanel,
  });
  app.slots.experimental_newThreadPanelAction({
    id: "new-task",
    title: "先建 task",
    icon: "ListChecks",
    component: NewTaskAction,
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

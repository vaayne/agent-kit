import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { InboxPanel } from "./src/InboxPanel.js";
import { NewTaskAction } from "./src/NewTaskAction.js";
import { OverviewTab } from "./src/OverviewTab.js";
import { ThreadTaskPanel } from "./src/ThreadTaskPanel.js";
import { TaskSidebar } from "./src/TaskSidebar.js";
import { resolveLanguage, STRINGS } from "./src/strings.js";

// Slot titles are registered before any RPC runs, so they follow the browser language only.
const t = STRINGS[resolveLanguage(undefined)];

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "task-navigator",
    title: "Task Navigator",
    description: "Task → thread tree, with attention derived from facts.",
    component: TaskSidebar,
  });
  app.slots.threadPanelAction({
    id: "task",
    title: t.panel.title,
    icon: "ListChecks",
    component: ThreadTaskPanel,
  });
  app.slots.experimental_newThreadPanelAction({
    id: "new-task",
    title: t.newTask.title,
    icon: "ListChecks",
    component: NewTaskAction,
  });
  app.slots.navPanel({
    id: "task-navigator",
    title: "Task Navigator",
    icon: "ListChecks",
    path: "board",
    component: OverviewTab,
    fixedTabs: [{
      panelId: "task-navigator",
      id: "inbox",
      title: t.inbox.kicker,
      icon: "Inbox",
      component: InboxPanel,
    }],
  });
});

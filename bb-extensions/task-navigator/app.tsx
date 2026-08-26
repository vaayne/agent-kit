import {
  definePluginApp,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";

function TaskNavigator({}: PluginThreadListProps) {
  return (
    <div className="px-2 py-3 text-xs text-muted-foreground">
      Task Navigator is loading.
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "task-navigator",
    title: "Task Navigator",
    description: "Task → thread tree, with attention derived from facts.",
    component: TaskNavigator,
  });
});

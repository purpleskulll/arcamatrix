import fs from 'fs/promises';

const TASKS_FILE = '/tmp/arcamatrix-tasks.json';

export interface TaskMetadata {
  customerEmail?: string;
  customerName?: string;
  username?: string;
  gatewayToken?: string;
  password?: string; // deprecated, use gatewayToken
  skills?: string[];
  stripeCustomerId?: string;
  subscriptionId?: string;
}

export interface Task {
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
  metadata: TaskMetadata;
  result?: any;
}

export interface TaskStore {
  tasks: Record<string, Task>;
}

export async function loadTasks(): Promise<TaskStore> {
  try {
    const data = await fs.readFile(TASKS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { tasks: {} };
  }
}

export async function saveTasks(store: TaskStore): Promise<void> {
  await fs.writeFile(TASKS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

export async function createTask(taskId: string, type: string, metadata: TaskMetadata): Promise<void> {
  const store = await loadTasks();
  store.tasks[taskId] = {
    type,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata
  };
  await saveTasks(store);
}

export async function findBySubscription(subscriptionId: string): Promise<{ taskId: string; username: string } | null> {
  const store = await loadTasks();
  for (const [taskId, task] of Object.entries(store.tasks)) {
    if (task.metadata?.subscriptionId === subscriptionId) {
      return { taskId, username: task.metadata?.username || '' };
    }
  }
  return null;
}

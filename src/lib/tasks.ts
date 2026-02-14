const SPRITES_API = 'https://api.sprites.dev/v1';
const SPRITE_NAME = 'swarm-orchestrator';
const TASKS_PATH = '/home/sprite/blackboard/tasks.json';

function getSpritesToken() {
  const token = process.env.SPRITES_API_TOKEN || process.env.SPRITES_TOKEN || '';
  if (!token) console.error("CRITICAL: Neither SPRITES_API_TOKEN nor SPRITES_TOKEN is set — task operations will fail");
  return token;
}

export interface TaskMetadata {
  customerEmail?: string;
  customerName?: string;
  username?: string;
  gatewayToken?: string;
  password?: string; // deprecated, use gatewayToken
  skills?: string[];
  stripeCustomerId?: string;
  subscriptionId?: string;
  stripeEventId?: string;
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
    const url = `${SPRITES_API}/sprites/${SPRITE_NAME}/fs/read?path=${encodeURIComponent(TASKS_PATH)}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${getSpritesToken()}` },
      cache: 'no-store',
    });
    if (!res.ok) return { tasks: {} };
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return { tasks: {} };
  }
}

export async function saveTasks(store: TaskStore): Promise<void> {
  const url = `${SPRITES_API}/sprites/${SPRITE_NAME}/fs/write?path=${encodeURIComponent(TASKS_PATH)}&mkdir=true`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${getSpritesToken()}` },
    body: JSON.stringify(store, null, 2),
  });
  if (!res.ok) {
    throw new Error(`Failed to save tasks: ${res.status}`);
  }
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

export async function findByEventId(stripeEventId: string): Promise<string | null> {
  const store = await loadTasks();
  for (const [taskId, task] of Object.entries(store.tasks)) {
    if (task.metadata?.stripeEventId === stripeEventId) {
      return taskId;
    }
  }
  return null;
}

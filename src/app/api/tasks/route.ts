import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SPRITES_API = 'https://api.sprites.dev/v1';
const SPRITE_NAME = 'swarm-orchestrator';
const TASKS_PATH = '/home/sprite/blackboard/tasks.json';

function getSpritesToken() {
  return process.env.SPRITES_API_TOKEN || process.env.SPRITES_TOKEN || '';
}

async function loadTasks() {
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

async function saveTasks(store: any) {
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

// GET /api/tasks - List tasks (provisioning agent polls this)
// GET /api/tasks?status=pending&type=provisioning - Filter
// GET /api/tasks?subscriptionId=sub_xxx - Find by subscription
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');
    const subscriptionId = url.searchParams.get('subscriptionId');

    const store = await loadTasks();
    let tasks = store.tasks;

    if (subscriptionId) {
      for (const [taskId, task] of Object.entries(tasks) as any) {
        if (task.metadata?.subscriptionId === subscriptionId) {
          return NextResponse.json({ taskId, username: task.metadata?.username });
        }
      }
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (status || type) {
      const filtered: Record<string, any> = {};
      for (const [taskId, task] of Object.entries(tasks) as any) {
        if (status && task.status !== status) continue;
        if (type && task.type !== type) continue;
        filtered[taskId] = task;
      }
      tasks = filtered;
    }

    return NextResponse.json({ tasks });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/tasks - Create a task (called by webhook)
export async function POST(request: Request) {
  try {
    const data = await request.json();

    if (!data.taskId || !data.type) {
      return NextResponse.json({ error: 'Missing taskId or type' }, { status: 400 });
    }

    const store = await loadTasks();

    store.tasks[data.taskId] = {
      type: data.type,
      status: data.status || 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: data.metadata || {}
    };

    await saveTasks(store);
    return NextResponse.json({ success: true, taskId: data.taskId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH /api/tasks - Update task status (called by provisioning agent)
export async function PATCH(request: Request) {
  try {
    const data = await request.json();
    const { taskId, status, result } = data;

    if (!taskId) {
      return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });
    }

    const store = await loadTasks();

    if (!store.tasks[taskId]) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    store.tasks[taskId].status = status || store.tasks[taskId].status;
    store.tasks[taskId].updated_at = new Date().toISOString();
    if (result) {
      store.tasks[taskId].result = result;
    }

    await saveTasks(store);
    return NextResponse.json({ success: true, taskId });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

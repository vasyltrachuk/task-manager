'use server';

import { createSupabaseServerClient } from '@/lib/server/supabase-server';
import { buildTenantContextFromSession } from '@/lib/server/tenant-context';

export async function createTask(input: {
  client_id: string;
  title: string;
  description?: string;
  status?: string;
  type?: string;
  due_date: string;
  priority?: number;
  assignee_id: string;
  recurrence?: string;
  recurrence_days?: number[];
  period?: string;
  proof_required?: boolean;
  subtasks?: string[];
}) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      tenant_id: ctx.tenantId,
      client_id: input.client_id,
      title: input.title.trim(),
      description: input.description || null,
      status: input.status || 'todo',
      type: input.type || 'other',
      due_date: input.due_date,
      priority: input.priority ?? 2,
      assignee_id: input.assignee_id,
      created_by: ctx.userId!,
      recurrence: input.recurrence || 'none',
      recurrence_days: input.recurrence_days ?? null,
      period: input.period || null,
      proof_required: input.proof_required ?? false,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Insert subtasks if provided
  if (input.subtasks?.length) {
    await supabase.from('subtasks').insert(
      input.subtasks.map((title, idx) => ({
        tenant_id: ctx.tenantId,
        task_id: data.id,
        title,
        sort_order: idx,
      }))
    );
  }

  // Log to audit
  await supabase.from('audit_log').insert({
    tenant_id: ctx.tenantId,
    actor_id: ctx.userId!,
    entity: 'task',
    entity_id: data.id,
    action: 'created',
    meta: { title: input.title },
  });

  return data;
}

export async function updateTask(input: {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  type?: string;
  due_date?: string;
  priority?: number;
  assignee_id?: string;
  recurrence?: string;
  recurrence_days?: number[];
  period?: string;
  proof_required?: boolean;
  subtasks?: string[];
}) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  const updateData: Record<string, unknown> = {};
  if (input.title !== undefined) updateData.title = input.title.trim();
  if (input.description !== undefined) updateData.description = input.description || null;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.type !== undefined) updateData.type = input.type;
  if (input.due_date !== undefined) updateData.due_date = input.due_date;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.assignee_id !== undefined) updateData.assignee_id = input.assignee_id;
  if (input.recurrence !== undefined) updateData.recurrence = input.recurrence;
  if (input.recurrence_days !== undefined) {
    updateData.recurrence_days = input.recurrence_days.length > 0 ? input.recurrence_days : null;
  }
  if (input.period !== undefined) updateData.period = input.period || null;
  if (input.proof_required !== undefined) updateData.proof_required = input.proof_required;

  const { error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', input.id);

  if (error) throw new Error(error.message);

  // Sync subtasks when provided.
  if (input.subtasks !== undefined) {
    const { error: deleteError } = await supabase
      .from('subtasks')
      .delete()
      .eq('task_id', input.id)
      .eq('tenant_id', ctx.tenantId);
    if (deleteError) throw new Error(deleteError.message);

    if (input.subtasks.length > 0) {
      const { error: insertError } = await supabase.from('subtasks').insert(
        input.subtasks.map((title, idx) => ({
          tenant_id: ctx.tenantId,
          task_id: input.id,
          title,
          sort_order: idx,
        }))
      );
      if (insertError) throw new Error(insertError.message);
    }
  }

  await supabase.from('audit_log').insert({
    tenant_id: ctx.tenantId,
    actor_id: ctx.userId!,
    entity: 'task',
    entity_id: input.id,
    action: 'updated',
    meta: { fields: Object.keys(updateData) },
  });
}

export async function deleteTask(taskId: string) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  if (ctx.userRole !== 'admin') {
    throw new Error('Лише адміністратор може видаляти задачі.');
  }

  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) throw new Error(error.message);
}

export async function moveTask(taskId: string, status: string) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  const { error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', taskId);

  if (error) throw new Error(error.message);

  await supabase.from('audit_log').insert({
    tenant_id: ctx.tenantId,
    actor_id: ctx.userId!,
    entity: 'task',
    entity_id: taskId,
    action: 'status_changed',
    meta: { details: `Статус змінено на ${status}` },
  });
}

export async function addSubtask(taskId: string, title: string) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  const { error } = await supabase.from('subtasks').insert({
    tenant_id: ctx.tenantId,
    task_id: taskId,
    title,
    sort_order: 0,
  });

  if (error) throw new Error(error.message);
}

export async function toggleSubtask(taskId: string, subtaskId: string) {
  const supabase = await createSupabaseServerClient();
  await buildTenantContextFromSession(supabase);

  // Fetch current state
  const { data: current } = await supabase
    .from('subtasks')
    .select('is_completed')
    .eq('id', subtaskId)
    .eq('task_id', taskId)
    .single();

  if (!current) throw new Error('Subtask not found');

  const { error } = await supabase
    .from('subtasks')
    .update({ is_completed: !current.is_completed })
    .eq('id', subtaskId);

  if (error) throw new Error(error.message);
}

export async function deleteSubtask(taskId: string, subtaskId: string) {
  const supabase = await createSupabaseServerClient();
  await buildTenantContextFromSession(supabase);

  const { error } = await supabase
    .from('subtasks')
    .delete()
    .eq('id', subtaskId)
    .eq('task_id', taskId);

  if (error) throw new Error(error.message);
}

export async function addComment(taskId: string, body: string) {
  const supabase = await createSupabaseServerClient();
  const ctx = await buildTenantContextFromSession(supabase);

  const { error } = await supabase.from('task_comments').insert({
    tenant_id: ctx.tenantId,
    task_id: taskId,
    author_id: ctx.userId!,
    body: body.trim(),
  });

  if (error) throw new Error(error.message);

  await supabase.from('audit_log').insert({
    tenant_id: ctx.tenantId,
    actor_id: ctx.userId!,
    entity: 'task',
    entity_id: taskId,
    action: 'comment_added',
    meta: { details: body.slice(0, 100) },
  });
}

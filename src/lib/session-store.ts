import fs from 'fs-extra';
import path from 'path';
import util from '@/lib/util.ts';

export interface SessionRecord {
  id: string;
  name: string;
  value: string;
  note?: string;
  createdAt: string;
  status?: 'unknown' | 'active' | 'invalid';
  lastSuccessAt?: string | null;
  lastFailAt?: string | null;
  lastError?: string | null;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'sessions.json');

async function ensureStore() {
  await fs.ensureDir(DATA_DIR);
  const exists = await fs.pathExists(STORE_FILE);
  if (!exists) {
    await fs.writeJson(STORE_FILE, { sessions: [] }, { spaces: 2 });
  }
}

async function readStore(): Promise<SessionRecord[]> {
  await ensureStore();
  const data = await fs.readJson(STORE_FILE);
  return Array.isArray(data?.sessions) ? data.sessions : [];
}

async function writeStore(sessions: SessionRecord[]) {
  await ensureStore();
  await fs.writeJson(STORE_FILE, { sessions }, { spaces: 2 });
}

function normalizeSessionValue(value: string) {
  return value.trim().replace(/^Bearer\s+/i, '');
}

function maskSessionValue(value: string) {
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function updateSessionByValue(value: string, updater: (session: SessionRecord) => SessionRecord) {
  const normalizedValue = normalizeSessionValue(value);
  const sessions = await readStore();
  let changed = false;
  const nextSessions = sessions.map((session) => {
    if (session.value !== normalizedValue) return session;
    changed = true;
    return updater({
      status: 'unknown',
      lastSuccessAt: null,
      lastFailAt: null,
      lastError: null,
      ...session,
    });
  });
  if (changed) {
    await writeStore(nextSessions);
  }
  return changed;
}

export async function listSessions() {
  return readStore();
}

export async function listMaskedSessions() {
  const sessions = await readStore();
  return sessions.map(({ value, ...rest }) => ({
    ...rest,
    status: rest.status || 'unknown',
    lastSuccessAt: rest.lastSuccessAt ?? null,
    lastFailAt: rest.lastFailAt ?? null,
    lastError: rest.lastError ?? null,
    maskedValue: maskSessionValue(value),
  }));
}

export async function addSession(input: { name?: string; value: string; note?: string }) {
  const value = normalizeSessionValue(input.value);
  const sessions = await readStore();
  const existing = sessions.find((session) => session.value === value);
  if (existing) {
    return existing;
  }

  const session: SessionRecord = {
    id: util.uuid(false),
    name: input.name?.trim() || `Session ${sessions.length + 1}`,
    value,
    note: input.note?.trim() || '',
    createdAt: new Date().toISOString(),
    status: 'unknown',
    lastSuccessAt: null,
    lastFailAt: null,
    lastError: null,
  };

  sessions.push(session);
  await writeStore(sessions);
  return session;
}

export async function deleteSession(id: string) {
  const sessions = await readStore();
  const nextSessions = sessions.filter((session) => session.id !== id);
  const deleted = nextSessions.length !== sessions.length;
  if (deleted) {
    await writeStore(nextSessions);
  }
  return deleted;
}

export async function markSessionSuccess(value: string) {
  await updateSessionByValue(value, (session) => ({
    ...session,
    status: 'active',
    lastSuccessAt: new Date().toISOString(),
    lastError: null,
  }));
}

export async function markSessionFailure(value: string, error: any) {
  await updateSessionByValue(value, (session) => ({
    ...session,
    status: 'invalid',
    lastFailAt: new Date().toISOString(),
    lastError: error?.message || String(error),
  }));
}

export async function recordSessionSuccess(value: string) {
  await markSessionSuccess(value);
}

export async function recordSessionFailure(value: string, error: any) {
  await markSessionFailure(value, error);
}

export async function getAuthorizationFromStore() {
  const sessions = await readStore();
  if (sessions.length === 0) {
    throw new Error('当前没有可用的 sessionid，请先在 Session 管理中添加。');
  }
  return `Bearer ${sessions.map((session) => session.value).join(',')}`;
}

export async function getSessionById(id: string) {
  const sessions = await readStore();
  return sessions.find((session) => session.id === id) || null;
}

export { STORE_FILE, maskSessionValue, normalizeSessionValue };

(function (root) {
  'use strict';
  const tasks = typeof module !== 'undefined' && module.exports ? require('./tasks.js') : root.PythonTasks;
  const VERSION = 1;
  const COUNTS = [8, 12, 16, 24];
  const DURATIONS = [15, 30, 45, 60];
  const GRADE_SCALE = [
    { grade: 5, min: 85, label: 'Отлично' },
    { grade: 4, min: 70, label: 'Хорошо' },
    { grade: 3, min: 50, label: 'Удовлетворительно' },
    { grade: 2, min: 20, label: 'Нужно повторить' },
    { grade: 1, min: 0, label: 'Начнём с основ' },
  ];
  function grade(correct, total) {
    if (!Number.isInteger(correct) || !Number.isInteger(total) || total <= 0 || correct < 0 || correct > total) throw new RangeError('Invalid score');
    const percent = correct / total * 100;
    return { ...GRADE_SCALE.find(item => percent >= item.min), percent, correct, total };
  }
  function createSession(profile, count, minutes, seed, now = Date.now()) {
    if (!COUNTS.includes(count) || !DURATIONS.includes(minutes)) throw new RangeError('Invalid settings');
    const clean = Object.fromEntries(['firstName', 'lastName', 'className'].map(key => [key, String(profile[key] || '').trim()]));
    if (Object.values(clean).some(value => !value || value.length > 50)) throw new Error('Заполните имя, фамилию и класс (до 50 символов).');
    return {
      version: VERSION, seed, profile: clean, count, minutes, startedAt: now,
      deadline: now + minutes * 60000, lastSeenAt: now, finishedAt: null, finishReason: null,
      answers: Array(count).fill(''), flags: Array(count).fill(false), current: 0,
      events: [], awaySince: null, awayKinds: [], awayMs: 0,
    };
  }
  function remainingMs(session, now = Date.now()) { return Math.max(0, session.deadline - now); }
  function finishSession(session, reason = 'manual', now = Date.now()) {
    if (session.finishedAt !== null) return session;
    endAway(session, now);
    session.finishedAt = Math.min(now, session.deadline);
    session.finishReason = now >= session.deadline ? 'timeout' : reason;
    session.lastSeenAt = now;
    return session;
  }
  function beginAway(session, kind, now = Date.now()) {
    if (session.finishedAt !== null || now >= session.deadline) return;
    if (session.awaySince === null) {
      session.awaySince = now;
      session.awayKinds = [kind];
      session.events.push({ type: 'away', at: now, endedAt: null, kinds: [kind] });
    } else if (!session.awayKinds.includes(kind)) {
      session.awayKinds.push(kind);
      const event = session.events.findLast(e => e.type === 'away' && e.endedAt === null);
      if (event) event.kinds = [...session.awayKinds];
    }
  }
  function endAway(session, now = Date.now()) {
    if (session.awaySince === null) return;
    const end = Math.max(session.awaySince, Math.min(now, session.deadline));
    session.awayMs += end - session.awaySince;
    const event = session.events.findLast(e => e.type === 'away' && e.endedAt === null);
    if (event) event.endedAt = end;
    session.awaySince = null;
    session.awayKinds = [];
  }
  function scoreSession(session) {
    const questions = tasks.generateQuestions(session.count, session.seed);
    const results = questions.map((q, i) => ({ ...q, input: session.answers[i], correct: tasks.checkAnswer(q, session.answers[i]) }));
    return { ...grade(results.filter(q => q.correct).length, session.count), results };
  }
  function validateSession(value) {
    if (!value || value.version !== VERSION || !COUNTS.includes(value.count) || !DURATIONS.includes(value.minutes)) return false;
    if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xFFFFFFFF) return false;
    if (!value.profile || ['firstName', 'lastName', 'className'].some(k => typeof value.profile[k] !== 'string' || !value.profile[k].trim() || value.profile[k].length > 50)) return false;
    if (![value.startedAt, value.deadline, value.lastSeenAt, value.awayMs].every(Number.isFinite) || value.awayMs < 0) return false;
    if (value.deadline !== value.startedAt + value.minutes * 60000) return false;
    if (value.finishedAt !== null && (!Number.isFinite(value.finishedAt) || value.finishedAt < value.startedAt || value.finishedAt > value.deadline)) return false;
    if (!Array.isArray(value.answers) || value.answers.length !== value.count || value.answers.some(v => typeof v !== 'string' || v.length > 2000)) return false;
    if (!Array.isArray(value.flags) || value.flags.length !== value.count || value.flags.some(v => typeof v !== 'boolean')) return false;
    if (!Number.isInteger(value.current) || value.current < 0 || value.current >= value.count) return false;
    if (value.awaySince !== null && !Number.isFinite(value.awaySince)) return false;
    if (!Array.isArray(value.awayKinds) || value.awayKinds.some(v => !['blur', 'hidden', 'pagehide'].includes(v))) return false;
    if (!Array.isArray(value.events) || value.events.some(e => !e || !['away', 'reload', 'fullscreen-exit', 'clock-change'].includes(e.type) || !Number.isFinite(e.at) || (e.type === 'away' && (!Array.isArray(e.kinds) || e.kinds.some(k => !['blur', 'hidden', 'pagehide'].includes(k)) || (e.endedAt !== null && !Number.isFinite(e.endedAt)))))) return false;
    return true;
  }
  const api = { VERSION, COUNTS, DURATIONS, GRADE_SCALE, grade, createSession, remainingMs, finishSession, beginAway, endAway, scoreSession, validateSession };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PythonCore = api;
})(globalThis);

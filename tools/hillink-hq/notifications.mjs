// Durable outbox state is in the event log. At-least-once delivery; key identifies an episode.
export async function deliverNotifications(engine, sink) {
  for (const alert of Object.values(engine.state.alerts)) {
    if (!alert.active || alert.deliveredAt || (alert.deliveryAttemptAt && engine.now() - alert.deliveryAttemptAt < 60_000)) continue;
    if (!sink) continue; // UI reports external delivery as unconfigured, not successful.
    try {
      await sink({ ...alert, notificationId: `${alert.key}:${alert.openedAt}` });
      engine.emit('NOTIFICATION_DELIVERED', { key: alert.key });
    } catch (error) {
      engine.emit('NOTIFICATION_FAILED', { key: alert.key, reason: error.message.slice(0, 500) });
    }
  }
}

export function webhookSink(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw Error('Notification webhook must use HTTPS');
  return async payload => {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok) throw Error(`Notification endpoint returned HTTP ${response.status}`);
  };
}

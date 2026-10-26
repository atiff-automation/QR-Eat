/**
 * A station heartbeat is sent every 60 seconds. Two missed heartbeats means
 * the station is not reliable enough to accept a confirm, without making a
 * single delayed heartbeat look like an outage.
 */
export const COUNTER_STATION_ONLINE_WINDOW_MS = 90_000;

export const COUNTER_SESSION_USER_AGENT = 'counter';
